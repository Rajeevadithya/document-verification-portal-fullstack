"""
Notifications Routes
======================
GET  /api/notifications/              – list all notifications (unread first)
GET  /api/notifications/unread-count  – count of unread notifications
PUT  /api/notifications/<id>/read     – mark single notification as read
PUT  /api/notifications/mark-all-read – mark all as read
POST /api/notifications/              – create a notification (internal/manual use)
DELETE /api/notifications/<id>        – delete a notification
"""
from datetime import datetime
from flask import Blueprint, request
from bson import ObjectId
from backend.app import mongo
from backend.app.utils.helpers import serialize_doc, success_response, error_response

notif_bp = Blueprint("notifications", __name__)


@notif_bp.route("/", methods=["GET"])
def list_notifications():
    """
    Returns notifications sorted by: unread first, then by created_at desc.
    Query params:
      - stage   : filter by stage (PR/PO/GRN/INVOICE)
      - unread  : 'true' to fetch only unread
      - limit   : default 50
    """
    stage   = request.args.get("stage", "").upper()
    unread  = request.args.get("unread", "").lower() == "true"
    limit   = int(request.args.get("limit", 50))

    query = {}
    if stage:
        query["stage"] = stage
    if unread:
        query["is_read"] = False

    cursor = (
        mongo.db.notifications
        .find(query)
        .sort([("is_read", 1), ("created_at", -1)])
        .limit(limit)
    )
    data = serialize_doc(list(cursor))
    return success_response(
        {"notifications": data, "count": len(data)},
        "Notifications fetched"
    )


@notif_bp.route("/unread-count", methods=["GET"])
def unread_count():
    count = mongo.db.notifications.count_documents({"is_read": False})
    return success_response({"unread_count": count}, "Unread count fetched")


@notif_bp.route("/<notif_id>/read", methods=["PUT"])
def mark_read(notif_id):
    result = mongo.db.notifications.update_one(
        {"_id": ObjectId(notif_id)},
        {"$set": {"is_read": True}}
    )
    if result.matched_count == 0:
        return error_response("Notification not found", 404)
    return success_response(None, "Notification marked as read")


@notif_bp.route("/mark-all-read", methods=["PUT"])
def mark_all_read():
    stage = request.args.get("stage", "").upper()
    query = {"is_read": False}
    if stage:
        query["stage"] = stage
    result = mongo.db.notifications.update_many(query, {"$set": {"is_read": True}})
    return success_response(
        {"updated_count": result.modified_count},
        "All notifications marked as read"
    )


@notif_bp.route("/", methods=["POST"])
def create_notification():
    """Manual notification creation (for testing or admin triggers)."""
    body = request.get_json()
    required = ["type", "stage", "reference_number", "message", "action_label", "action_route"]
    missing = [f for f in required if not body.get(f)]
    if missing:
        return error_response(f"Missing fields: {', '.join(missing)}", 400)

    notif = {
        "type": body["type"],
        "stage": body["stage"].upper(),
        "reference_number": body["reference_number"],
        "message": body["message"],
        "action_label": body["action_label"],
        "action_route": body["action_route"],
        "is_read": False,
        "created_at": datetime.utcnow()
    }
    result = mongo.db.notifications.insert_one(notif)
    notif["_id"] = str(result.inserted_id)
    notif["created_at"] = notif["created_at"].isoformat()
    return success_response(notif, "Notification created", 201)


@notif_bp.route("/<notif_id>", methods=["DELETE"])
def delete_notification(notif_id):
    result = mongo.db.notifications.delete_one({"_id": ObjectId(notif_id)})
    if result.deleted_count == 0:
        return error_response("Notification not found", 404)
    return success_response(None, "Notification deleted")
