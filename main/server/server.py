from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleWare
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

app = FastAPI()

app.add_middleware(
    CORSMiddleWare, allow_origins = ["*"], allow_credentials=True, allow_methods=True, allow_headers=True
)

model_url = "readerbench/qwen2_1.5b_scoring_se_ta_su_pa_v3"
model_version = "afdfe93"
tokenizer = AutoTokenizer.from_pretrained(model_url, revision=model_version)

model = AutoModelForSeq2SeqLM.from_pretrained(model_url, revision=model_version)

class info_request(BaseModel):
    context: str
    question: str
    student_response: str
    
@app.post("/score/summary")
async def score_summary(req: info_request):
    prompt = (
        f"Context:\n{req.context}\n\n"
        f"Question:\n{req.question}\n\n"
        f"Student’s answer:\n{req.student_response}\n\n"
        "Please provide your evaluation as a JSON object with exactly these keys:\n"
        "  \"Cohesion\", \"Details\", \"Language beyond source text\",\n"
        "  \"Main Idea\", \"Objective language\", \"Wording\"\n"
        "Each value should be one of: \"Excellent\", \"Good\", \"Fair\", \"Poor\", or \"Very Poor\".\n"
        "Do not include any extra text or keys—output only valid JSON."
    )

    inputs = tokenizer(prompt, return_tensors="pt", truncation=True)
    outputs = model.generate(
        **inputs,
        max_new_tokens=1024,
        do_sample=False
    )
    
    feedback_str = tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
    try:
        feedback_json = json.loads(feedback_str)
    except json.JSONDecodeError:
        feedback_json = {"error": feedback_str}
    return feedback_json

