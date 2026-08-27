package com.konolivepro.mobile

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject

class OfflineStore(context: Context) : SQLiteOpenHelper(context.applicationContext, DB_NAME, null, DB_VERSION) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE requests (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL, dirty INTEGER NOT NULL DEFAULT 0)")
        db.execSQL("CREATE TABLE notifications (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL, dirty INTEGER NOT NULL DEFAULT 0)")
        db.execSQL("CREATE TABLE outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, operation TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)")
        db.execSQL("CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    fun cacheRequests(items: List<ApplicantRequest>) = transaction {
        val now = System.currentTimeMillis()
        items.forEach { item ->
            if (!isDirty("requests", item.id)) {
                writableDatabase.insertWithOnConflict("requests", null, ContentValues().apply {
                    put("id", item.id)
                    put("payload", requestJson(item).toString())
                    put("updated_at", now)
                    put("dirty", 0)
                }, SQLiteDatabase.CONFLICT_REPLACE)
            }
        }
        setMetadata("requests_synced_at", now.toString())
    }

    fun cacheNotifications(items: List<ApplicantNotification>) = transaction {
        val now = System.currentTimeMillis()
        items.forEach { item ->
            if (!isDirty("notifications", item.id)) {
                writableDatabase.insertWithOnConflict("notifications", null, ContentValues().apply {
                    put("id", item.id)
                    put("payload", notificationJson(item).toString())
                    put("updated_at", now)
                    put("dirty", 0)
                }, SQLiteDatabase.CONFLICT_REPLACE)
            }
        }
        setMetadata("notifications_synced_at", now.toString())
    }

    fun cachedRequests(): List<ApplicantRequest> = readableDatabase.rawQuery(
        "SELECT payload FROM requests ORDER BY updated_at DESC", null
    ).use { cursor ->
        buildList {
            while (cursor.moveToNext()) {
                val row = JSONObject(cursor.getString(0))
                add(ApplicantRequest(row.optString("id"), row.optString("phone"), row.optString("status"), row.optString("notes").takeIf { it.isNotBlank() }, row.optString("createdAt")))
            }
        }
    }

    fun cachedNotifications(): List<ApplicantNotification> = readableDatabase.rawQuery(
        "SELECT payload FROM notifications ORDER BY updated_at DESC", null
    ).use { cursor ->
        buildList {
            while (cursor.moveToNext()) {
                val row = JSONObject(cursor.getString(0))
                add(ApplicantNotification(row.optString("id"), row.optString("title"), row.optString("body"), row.optBoolean("isRead"), row.optString("createdAt")))
            }
        }
    }

    fun enqueue(operation: String, payload: JSONObject) {
        writableDatabase.insert("outbox", null, ContentValues().apply {
            put("operation", operation)
            put("payload", payload.toString())
            put("created_at", System.currentTimeMillis())
            put("attempts", 0)
        })
    }

    fun pendingOperations(): List<PendingMutation> = readableDatabase.rawQuery(
        "SELECT id, operation, payload, attempts FROM outbox ORDER BY id ASC", null
    ).use { cursor ->
        buildList {
            while (cursor.moveToNext()) add(PendingMutation(cursor.getLong(0), cursor.getString(1), JSONObject(cursor.getString(2)), cursor.getInt(3)))
        }
    }

    fun removeOperation(id: Long) { writableDatabase.delete("outbox", "id = ?", arrayOf(id.toString())) }

    fun retryOperation(id: Long) {
        writableDatabase.execSQL("UPDATE outbox SET attempts = attempts + 1 WHERE id = ?", arrayOf(id))
    }

    fun outboxCount(): Int = readableDatabase.rawQuery("SELECT COUNT(*) FROM outbox", null).use { cursor ->
        if (cursor.moveToFirst()) cursor.getInt(0) else 0
    }

    fun setMetadata(key: String, value: String) {
        writableDatabase.insertWithOnConflict("metadata", null, ContentValues().apply { put("key", key); put("value", value) }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun metadata(key: String): String? = readableDatabase.query("metadata", arrayOf("value"), "key = ?", arrayOf(key), null, null, null).use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
    }

    fun cachedJson(): JSONObject = JSONObject().apply {
        put("requests", JSONArray().also { array -> cachedRequests().forEach { array.put(requestJson(it)) } })
        put("notifications", JSONArray().also { array -> cachedNotifications().forEach { array.put(notificationJson(it)) } })
        put("pendingMutations", outboxCount())
    }

    private inline fun <T> transaction(block: SQLiteDatabase.() -> T): T {
        val database = writableDatabase
        database.beginTransaction()
        return try {
            val result = database.block()
            database.setTransactionSuccessful()
            result
        } finally {
            database.endTransaction()
        }
    }

    private fun isDirty(table: String, id: String): Boolean = readableDatabase.query(table, arrayOf("dirty"), "id = ?", arrayOf(id), null, null, null).use { cursor ->
        cursor.moveToFirst() && cursor.getInt(0) == 1
    }

    private fun requestJson(item: ApplicantRequest) = JSONObject().apply {
        put("id", item.id); put("phone", item.phone); put("status", item.status); put("notes", item.notes ?: ""); put("createdAt", item.createdAt)
    }

    private fun notificationJson(item: ApplicantNotification) = JSONObject().apply {
        put("id", item.id); put("title", item.title); put("body", item.body); put("isRead", item.isRead); put("createdAt", item.createdAt)
    }

    companion object {
        private const val DB_NAME = "konolive_offline.db"
        private const val DB_VERSION = 1
    }
}

data class PendingMutation(val id: Long, val operation: String, val payload: JSONObject, val attempts: Int)
