import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi_pagination import add_pagination
from uvicorn import run

from app.config import DefaultSettings, get_settings
from app.routes import list_of_routes as api_routes
from app.utils.common import get_hostname

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


def bind_routes(application: FastAPI, setting: DefaultSettings) -> None:
    """
    Bind all routes to application.
    """
    for route in api_routes:
        application.include_router(route, prefix=setting.PATH_PREFIX_API)

    # for route in frontend_routes:
    #     application.include_router(route, prefix=setting.PATH_PREFIX_FRONTEND)


def get_app() -> FastAPI:
    """
    Creates application and all dependable objects.
    """
    description = "Приложение для медцентра"

    tags_metadata = [
        {
            "name": "Application Health",
            "description": "API health check.",
        },
    ]

    application = FastAPI(
        title="medcetner-app",
        description=description,
        docs_url="/swagger",
        openapi_url="/openapi",
        version="0.1.0",
        openapi_tags=tags_metadata,
    )
    settings = get_settings()
    bind_routes(application, settings)
    add_pagination(application)
    application.state.settings = settings
    return application


app = get_app()

if __name__ == "__main__":
    settings_for_application = get_settings()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    run(
        "app.__main__:app",
        host=get_hostname(settings_for_application.API_HOST),
        port=settings_for_application.API_PORT,
        reload=True,
        reload_dirs=["app", "tests"],
        log_level="debug",
    )
