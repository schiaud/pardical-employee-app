import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// TODO: Replace with your actual Firebase configuration
// You can find this in your Firebase console under Project Settings
const firebaseConfig = {
  apiKey: "AIzaSyAM5VumxhhEtnqy_8PbJq0NW5zT7Jwy_tQ",
  authDomain: "pardical-web-app.firebaseapp.com",
  databaseURL: "https://pardical-web-app.firebaseio.com",
  projectId: "pardical-web-app",
  storageBucket: "pardical-web-app.firebasestorage.app",
  messagingSenderId: "493812084211",
  appId: "1:493812084211:web:a082ed5ab79a5ce4067686",
  measurementId: "G-6XY57TJ6Z4"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

// Configure Google Auth provider
googleProvider.setCustomParameters({
  prompt: 'select_account'
});