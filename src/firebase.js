import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDlzA7CdqPE-Uvz9yfSC_M1_kXArZharHw",
  authDomain: "rr-atelier-40b51.firebaseapp.com",
  projectId: "rr-atelier-40b51",
  storageBucket: "rr-atelier-40b51.firebasestorage.app",
  messagingSenderId: "266803956962",
  appId: "1:266803956962:web:521bdcc7b83464f8e5e2bb",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);