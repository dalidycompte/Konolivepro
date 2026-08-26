package com.konolivepro.mobile

data class ApplicantRequest(
    val id: String,
    val phone: String,
    val status: String,
    val notes: String?,
    val createdAt: String,
)

data class ApplicantNotification(
    val id: String,
    val title: String,
    val body: String,
    val isRead: Boolean,
    val createdAt: String,
)
