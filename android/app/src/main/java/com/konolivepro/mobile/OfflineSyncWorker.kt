package com.konolivepro.mobile

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import org.json.JSONObject

class OfflineSyncWorker(appContext: Context, workerParams: WorkerParameters) : CoroutineWorker(appContext, workerParams) {
    private val store = OfflineStore(appContext)
    private val api = SupabaseApi(appContext)

    override suspend fun doWork(): Result {
        if (SessionStore(applicationContext).accessToken.isNullOrBlank()) return Result.success()
        return try {
            store.pendingOperations().forEach { mutation ->
                when (mutation.operation) {
                    OP_CREATE_REQUEST -> api.createVerificationRequest(mutation.payload.optString("phone"))
                    OP_RESPOND_CALL -> api.respondToCall(mutation.payload.optString("callId"), mutation.payload.optString("action"))
                }
                store.removeOperation(mutation.id)
            }
            val requests = api.getApplicantRequests()
            val notifications = api.getApplicantNotifications(50)
            store.cacheRequests(requests)
            store.cacheNotifications(notifications)
            Result.success()
        } catch (error: Exception) {
            store.pendingOperations().filter { it.attempts >= MAX_ATTEMPTS }.forEach { store.removeOperation(it.id) }
            Result.retry()
        }
    }

    companion object {
        const val OP_CREATE_REQUEST = "CREATE_REQUEST"
        const val OP_RESPOND_CALL = "RESPOND_CALL"
        private const val MAX_ATTEMPTS = 8
    }
}

object OfflineSyncScheduler {
    private const val UNIQUE_PERIODIC = "konolive-offline-periodic-sync"
    private const val UNIQUE_NOW = "konolive-offline-sync-now"

    fun install(context: Context) {
        val constraints = androidx.work.Constraints.Builder()
            .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED)
            .build()
        val request = androidx.work.PeriodicWorkRequestBuilder<OfflineSyncWorker>(15, java.util.concurrent.TimeUnit.MINUTES)
            .setConstraints(constraints)
            .setBackoffCriteria(androidx.work.BackoffPolicy.EXPONENTIAL, 30, java.util.concurrent.TimeUnit.SECONDS)
            .build()
        androidx.work.WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            UNIQUE_PERIODIC,
            androidx.work.ExistingPeriodicWorkPolicy.UPDATE,
            request
        )
    }

    fun syncNow(context: Context) {
        val constraints = androidx.work.Constraints.Builder()
            .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED)
            .build()
        val request = androidx.work.OneTimeWorkRequestBuilder<OfflineSyncWorker>()
            .setConstraints(constraints)
            .setBackoffCriteria(androidx.work.BackoffPolicy.EXPONENTIAL, 15, java.util.concurrent.TimeUnit.SECONDS)
            .build()
        androidx.work.WorkManager.getInstance(context).enqueueUniqueWork(
            UNIQUE_NOW,
            androidx.work.ExistingWorkPolicy.KEEP,
            request
        )
    }
}

object OfflineConnectivity {
    private var registered = false

    fun register(context: Context) {
        if (registered) return
        val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager ?: return
        val request = android.net.NetworkRequest.Builder()
            .addCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivity.registerNetworkCallback(request, object : android.net.ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: android.net.Network) {
                OfflineSyncScheduler.syncNow(context.applicationContext)
            }
        })
        registered = true
    }
}
