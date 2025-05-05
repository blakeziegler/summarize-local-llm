import logging
import time
import os
import torch
import language_tool_python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from transformers import pipeline, AutoModelForSeq2SeqLM, AutoTokenizer
from sentence_transformers import SentenceTransformer, util

# ——— Logging Config———
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

# ——— FastAPI and CORS setup ———
app = FastAPI()

# 1) Serve index.html at “/”
client_dir = "/Users/blakeziegler/tech/Change-Lab/local-llm/main/client"
@app.get("/", response_class=FileResponse)
async def serve_index():
    return os.path.join(client_dir, "index.html")

# 2) Mount everything in ./client (CSS, JS, etc.) under /static
app.mount(
    "/static",
    StaticFiles(directory=client_dir),
    name="static",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ——— Device detection ———
# Order:
# 1. GPU
# 2. Apple MPS
# 3. CPU

if torch.cuda.is_available():
    device_str = "cuda"
    summarizer_device = 0
elif torch.backends.mps.is_available():
    device_str = "mps"
    summarizer_device = -1
else:
    device_str = "cpu"
    summarizer_device = -1
logger.info(f"Using device: {device_str}")

'''
--- REFERENCE SUMMARIZATION PIPELINE ---

This section creates a summarization pipeline using a localized version of 
facebooks bart cnn to create a reference summary for a given text. This
will then be compared to the student summary and the similarity will be
used in the final summary score

Pipeline
----------
- Defines model, tokenizer, and device type
- Generates text summary using the instructions in 'summarizer_input'
- This will then be encoded as a tensor along with the student response
- Cosine similarity is measured and recorded
'''

summarizer_model = AutoModelForSeq2SeqLM.from_pretrained("facebook/bart-large-cnn")
summarizer_tokenizer = AutoTokenizer.from_pretrained("facebook/bart-large-cnn")
summarizer = pipeline(
    "summarization",
    model=summarizer_model,
    tokenizer=summarizer_tokenizer,
    device=summarizer_device,
)

# Embedding model initialization
embedder = SentenceTransformer("all-mpnet-base-v2", device=device_str)

# Grammar checker initialization
grammar_tool = language_tool_python.LanguageTool("en-US")

# Request response info
class InfoRequest(BaseModel):
    context: str
    student_response: str


# Post request for scoring endpoint
@app.post("/score/summary")
async def score_summary(req: InfoRequest):
    # Reference summary generation
    passage = req.context.strip()
    ref_out = summarizer(
        passage,
        max_length=256,
        num_beams=4,
        length_penalty=1.2,
        early_stopping=True,
        do_sample=False,
    )
    first_out = ref_out[0]
    if isinstance(first_out, dict) and "summary_text" in first_out:
        reference = first_out["summary_text"].strip()
    else:
        reference = str(first_out).strip()
    logger.info(f"Generated reference summary: {reference}")

    # Prepare student summary for embedding
    prediction = req.student_response.strip()
    start_time = time.time()

    # Compute embedding similarity
    emb_ref = embedder.encode(reference, convert_to_tensor=True)
    emb_pred = embedder.encode(prediction, convert_to_tensor=True)
    ref_cos = util.cos_sim(emb_ref, emb_pred).item()
    reference_similarity = ((ref_cos + 1) / 2) * 100

    '''
    ---CONTEXT SUMMARY---
    
    In addition to comparing the student response to the reference summary the
    response is also compared to the context of the passage. After the comparison,
    we rescale the similarity to better distinguish good vs bad summaries.
    
    1. embedder.encode(passage, convert_to_tensor=True)
    Embeds the passage as a vector so it can be compared to the student response.
    
    2. util.cos_sim(emb_ctx, emb_pred).item()
    computes the cosine sim between the student summary and the text.

    '''
    emb_ctx = embedder.encode(passage, convert_to_tensor=True)
    ctx_cos = util.cos_sim(emb_ctx, emb_pred).item()
    context_similarity = ctx_cos * 50 + 50

    # Raw score: 50% reference sim + 50% context sim
    raw_score = 0.5 * reference_similarity + 0.5 * context_similarity
    interim_score = int(round(raw_score))

    '''
    --- LENGTH OF SUMMARY PENALTY ---
    
    Since the context summary does not take into account length when generating
    a score, we offset this by implementing a tiered length penalty system. As follows:
    
    1. < 20 words = -15 points
    2. < 15 pct of the source text = -15 points
    3. < 25 pct of the source text = -10 points
    4. < 35 pct of the source text = -5 points
    5. > 65 pct of the source text = -5 points
    6. > 75 pct of the source text = -10 points
    
    '''
    ref_len = len(reference.split())
    pred_len = len(prediction.split())
    if pred_len < 20:
        length_penalty = 15
    else:
        ratio = pred_len / ref_len if ref_len > 0 else 0
        if ratio < 0.15:
            length_penalty = 15
        elif ratio < 0.25:
            length_penalty = 10
        elif ratio < 0.35:
            length_penalty = 5
        elif ratio > 0.65:
            length_penalty = 5
        elif ratio > 0.75:
            length_penalty = 10
        else:
            length_penalty = 0

    '''
    --- GRAMMAR PENALTY ---
    
    Uses the python language tool to spot errors in over 20 grammatical categories
    which include but not limited to:
    
    - Capitalization
    - Style
    - Semantics
    - Repetition
    - Nonstandard phrases
    
    Then the number of errors per 100 words is calculated meaning shorter summaries with more errors
    get more heavily penalized than long summaries with a similar number of errors. A one point penalty is added
    per error up to a max penalty of 20. 
    '''
    
    matches = grammar_tool.check(prediction)
    errors_per_100 = len(matches) / (pred_len / 100) if pred_len > 0 else len(matches)
    grammar_penalty = min(int(errors_per_100 * 1), 20)

    '''
    --- FINAL SCORE CALCULATION ---
    
    The final score is calculated using the average of the similarity scores with the
    penalties attached:
    
    interim_score = Average(reference similarity, context similarity)
    final score = interim_score - length_penalty - grammar_penalty
    '''
    final_score = max(0, interim_score - length_penalty - grammar_penalty)

    elapsed = time.time() - start_time
    logger.info(
        f"RefSim={reference_similarity:.1f}, CtxSim={context_similarity:.1f}, "
        f"LenPen={length_penalty}, GramPen={grammar_penalty} -> Final={final_score}"
    )
    
    #logged on web page

    return {
        "reference_summary": reference,
        "reference_similarity": round(reference_similarity, 1),
        "context_similarity": round(context_similarity, 1),
        "length_penalty": length_penalty,
        "grammar_penalty": grammar_penalty,
        "final_score": final_score,
        "elapsed_time_s": f"{elapsed:.2f}"
    }
