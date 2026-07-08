import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, setDoc, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCNJFUyXdKyT46gJqcz92MDEgGd9j7qXP4",
  authDomain: "anjiana-clothing.firebaseapp.com",
  projectId: "anjiana-clothing",
  storageBucket: "anjiana-clothing.firebasestorage.app",
  messagingSenderId: "161221245788",
  appId: "1:161221245788:web:ea21a83449ed11259edf99",
  measurementId: "G-8X4V33DZCX"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const auth = getAuth(app);
const storage = getStorage(app);

console.log("Firebase initialized.");

export { 
  app, 
  db, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, setDoc, query, where, orderBy, limit,
  auth, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail,
  storage, ref, uploadBytes, getDownloadURL
};
