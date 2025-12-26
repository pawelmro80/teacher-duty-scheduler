from fastapi import APIRouter, UploadFile, File, HTTPException
from services.ocr.vision_client import VisionClient
from services.ocr.preprocessor import ImagePreprocessor

router = APIRouter(prefix="/ocr", tags=["OCR"])

@router.post("/analyze")
async def analyze_schedule(
    file: UploadFile = File(...),
    teacher_code: str = "UNKNOWN"
):
    try:
        # 1. Preprocess
        preprocessor = ImagePreprocessor()
        img_array = await preprocessor.preprocess(file)
        img_bytes = preprocessor.encode_image(img_array)
        
        # 2. Vision API
        client = VisionClient()
        if not client.client:
            raise HTTPException(status_code=503, detail="OpenAI API Key not configured")
            
        result = await client.analyze_schedule(img_bytes, teacher_code)
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
