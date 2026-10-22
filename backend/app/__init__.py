from flask import Flask
from flask_pymongo import PyMongo
from flask_cors import CORS
from .config import Config

mongo = PyMongo()

def create_app():
    app = Flask(__name__)
    app.json.sort_keys = False 
    app.config.from_object(Config)

    CORS(app, resources={r"/api/*": {"origins": "*"}})
    mongo.init_app(app)

    # Auto-sanitize existing trailing whitespace in MongoDB records
    try:
        with app.app_context():
            for coll_name, ref_field in [
                ("purchase_requisitions", "purchaseRequisitionNumber"),
                ("purchase_orders", "purchaseOrderNumber"),
                ("goods_receipts", "materialDocumentNumber"),
            ]:
                coll = mongo.db[coll_name]
                for doc in coll.find({}, {ref_field: 1}):
                    val = doc.get(ref_field)
                    if isinstance(val, str) and val != val.strip():
                        clean = val.strip()
                        coll.update_one({"_id": doc["_id"]}, {"$set": {ref_field: clean}})

            # Also sanitize supplier/vendor on purchase orders
            for po in mongo.db.purchase_orders.find({}, {"supplier": 1, "vendor": 1}):
                sup = po.get("supplier") or po.get("vendor")
                if isinstance(sup, str):
                    clean_sup = sup.strip()
                    if po.get("supplier") != clean_sup or po.get("vendor") != clean_sup:
                        mongo.db.purchase_orders.update_one(
                            {"_id": po["_id"]},
                            {"$set": {"supplier": clean_sup, "vendor": clean_sup}}
                        )
    except Exception as e:
        print(f"[STARTUP WARNING] Could not sanitize whitespace: {e}", flush=True)

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

    from .services.document_service import OCRValidationError
    from .utils.helpers import error_response

    from werkzeug.exceptions import HTTPException

    @app.errorhandler(OCRValidationError)
    def handle_ocr_validation_error(exc):
        return error_response(str(exc), 400)

    @app.errorhandler(ValueError)
    def handle_value_error(exc):
        return error_response(str(exc), 400)

    @app.errorhandler(HTTPException)
    def handle_http_exception(exc):
        return error_response(exc.description, exc.code)

    return app
