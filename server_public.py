
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "simulator"))

from fastapi import HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from simulator.api import app

from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "simulator"))

from simulator.api import app

DIST = Path(__file__).resolve().parent / "dist"

if not (DIST / "index.html").is_file():
    raise RuntimeError("Frontend build missing: run npm run build")

# Serve Vite's compiled JavaScript and CSS.
app.mount(
    "/assets",
    StaticFiles(directory=DIST / "assets"),
    name="assets",
)

@app.get("/", include_in_schema=False)
async def frontend_home():
    return FileResponse(DIST / "index.html")

@app.get("/{path:path}", include_in_schema=False)
async def frontend_fallback(path: str):
    # Never serve the React HTML for unknown API routes.
    if path == "api" or path.startswith("api/"):
        raise HTTPException(status_code=404)

    requested = (DIST / path).resolve()

    # Serve public assets copied by Vite.
    if requested.is_relative_to(DIST.resolve()) and requested.is_file():
        return FileResponse(requested)

    # Allow React to handle client-side routes.
    return FileResponse(DIST / "index.html")
