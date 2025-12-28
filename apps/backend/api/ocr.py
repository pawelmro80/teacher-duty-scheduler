from fastapi import APIRouter, UploadFile, File, HTTPException
from services.ocr.vision_client import VisionClient
from services.ocr.preprocessor import ImagePreprocessor

router = APIRouter(prefix="/ocr", tags=["OCR"])

@router.post("/analyze")
async def analyze_schedule(
    file: UploadFile = File(...),
    teacher_code: str = "UNKNOWN"
):
    """
    Analyzes an uploaded image to extract teacher schedule data.
    
    Pipeline:
    1. Preprocessing: Resizing, grayscale, contrast enhancement (`ImagePreprocessor`).
    2. Vision AI: Sends image to OpenAI Vision API (`VisionClient`).
    3. JSON Parsing: Extracts structured lesson data from AI response.
    
    Args:
        file: Image file (JPG/PNG).
        teacher_code: Optional hint for the teacher's identity.
        
    Returns:
        dict: JSON object conforming to TeacherSchedule format.
    """
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
