from flask import Flask
from flask_pymongo import PyMongo
from flask_cors import CORS
from .config import Config

mongo = PyMongo()

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(app, resources={r"/api/*": {"origins": "*"}})
    mongo.init_app(app)

    import os
    for folder in ["pr", "po", "grn", "invoice"]:
        os.makedirs(os.path.join(app.config["UPLOAD_FOLDER"], folder), exist_ok=True)

    # Register blueprints
    from .routes.master_data import master_data_bp
    from .routes.purchase_requisition import pr_bp
    from .routes.purchase_order import po_bp
    from .routes.goods_receipt import grn_bp
    from .routes.invoice_verification import inv_bp
    from .routes.notifications import notif_bp
    from .routes.dashboard import dashboard_bp
    from .routes.chatbot import chatbot_bp

    app.register_blueprint(master_data_bp, url_prefix="/api/master")
    app.register_blueprint(pr_bp,          url_prefix="/api/pr")
    app.register_blueprint(po_bp,          url_prefix="/api/po")
    app.register_blueprint(grn_bp,         url_prefix="/api/grn")
    app.register_blueprint(inv_bp,         url_prefix="/api/invoice")
    app.register_blueprint(notif_bp,       url_prefix="/api/notifications")
    app.register_blueprint(dashboard_bp,   url_prefix="/api/dashboard")
    app.register_blueprint(chatbot_bp, url_prefix="/api/chatbot")

    @app.route("/api/health")
    def health():
        return {"status": "ok", "service": "SAP Procurement Portal API"}

    return app
