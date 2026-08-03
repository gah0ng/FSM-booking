import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// ⬇️ Firebase 콘솔(https://console.firebase.google.com)에서
//    프로젝트 만들기 → 웹 앱 추가 후 나오는 값을 여기에 붙여넣으세요.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
