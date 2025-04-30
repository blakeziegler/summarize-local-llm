from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from transformers import AutoTokenizer, AutoModelForCausalLM
import json
import time
import logging
logging.basicConfig(
    level    = logging.INFO,
    format   = "%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model_url = "readerbench/qwen2_1.5b_scoring_se_ta_su_pa_v3"
model_version = "afdfe93"
tokenizer = AutoTokenizer.from_pretrained(model_url, revision=model_version)

model = AutoModelForCausalLM.from_pretrained(model_url, revision=model_version)

class info_request(BaseModel):
    context: str
    question: str
    student_response: str

@app.get("/")
def root():
    return {"message": "FastAPI is alive"}
    
@app.post("/score/summary")
async def score_summary(req: info_request):
    # 1) Build the prompt exactly as before, but append an explicit marker
    prompt = (
        f"Context:\n{req.context}\n\n"
        f"Question:\n{req.question}\n\n"
        f"Student’s answer:\n{req.student_response}\n\n"
        "Please provide your evaluation as a JSON object with EXACTLY these keys:\n"
        "  \"Cohesion\", \"Details\", \"Language beyond source text\",\n"
        "  \"Main Idea\", \"Objective language\", \"Wording\"\n"
        "Each value should be one of: \"Excellent\", \"Good\", \"Fair\", \"Poor\", or \"Very Poor\".\n"
        "Do not include any extra text or keys—output only valid JSON.\n\n"
        "Answer:\n"
    )

    # 2) Tokenize the prompt+marker
    inputs = tokenizer(prompt, return_tensors="pt", truncation=True)
    input_len = inputs["input_ids"].shape[1]

    # 3) Generate without forcing eos, so we get actual new tokens
    logging.info("Generating")
    start = time.time()
    outputs = model.generate(
        **inputs,
        max_new_tokens=256,
        do_sample=False,
        pad_token_id=tokenizer.pad_token_id,
        eos_token_id=tokenizer.eos_token_id,
        
    )
    logging.info(f"Generation Completed in {time.time() - start:.2f}s")

    # 4) Slice off only the newly generated tokens
    gen_ids   = outputs[0][input_len:]
    feedback_str = tokenizer.decode(gen_ids, skip_special_tokens=True).strip()

    # Fallback: if empty, decode everything (for debugging)
    if not feedback_str:
        feedback_str = tokenizer.decode(outputs[0], skip_special_tokens=True)
    
    print("Model Output:\n", feedback_str)

    # 5) Now parse JSON from the very first { … }
    start = feedback_str.find("{")
    end   = feedback_str.rfind("}")
    candidate = feedback_str[start : end+1] if start!=-1 and end>start else feedback_str

    try:
        feedback_json = json.loads(candidate)
    except json.JSONDecodeError:
        return {
            "error":         "failed to parse JSON",
            "raw_output":    feedback_str,
            "json_candidate": candidate,
        }

    return feedback_json