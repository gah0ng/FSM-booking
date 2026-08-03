import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD2sLoQsZWcRNuMMh14DMNVTjT39PciJyE",
  authDomain: "fsm-booking.firebaseapp.com",
  projectId: "fsm-booking",
  storageBucket: "fsm-booking.firebasestorage.app",
  messagingSenderId: "119721843906",
  appId: "1:119721843906:web:7e8ef56a0778b0a4c5af5b",
  measurementId: "G-G7DZKJQCQ1"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
