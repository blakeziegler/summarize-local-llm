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
