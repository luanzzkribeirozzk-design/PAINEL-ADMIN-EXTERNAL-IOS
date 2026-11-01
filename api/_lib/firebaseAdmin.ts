import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'

const projectId = process.env.FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()

let app: ReturnType<typeof initializeApp> | null = null
let initializationError = ''
if (projectId && clientEmail && privateKey) {
  try { app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }) }
  catch (error) { initializationError = error instanceof Error ? error.name : 'INVALID_FIREBASE_CREDENTIALS' }
}

export const db = app ? getFirestore(app) : null
export const adminReady = Boolean(app)
export const firebaseInitializationError = initializationError
export { FieldValue, Timestamp }
