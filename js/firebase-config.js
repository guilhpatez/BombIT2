// Cole aqui as configurações do seu app Web, fornecidas pelo Console do Firebase.
// A apiKey de um app Web é pública por design; proteja o banco com as regras do README.
export const firebaseConfig = {
  apiKey: "AIzaSyDmbyiYcMmv2q43WwFnxj8iyjYWDQCK7cg",
    authDomain: "trabalho-de-ingles-64f43.firebaseapp.com",
    databaseURL: "https://trabalho-de-ingles-64f43-default-rtdb.firebaseio.com",
    projectId: "trabalho-de-ingles-64f43",
    storageBucket: "trabalho-de-ingles-64f43.firebasestorage.app",
    messagingSenderId: "585612753460",
    appId: "1:585612753460:web:6289cf15e8fe2334872861",
    measurementId: "G-YE8HRQWKQV"
};

export const firebaseIsConfigured = !firebaseConfig.apiKey.startsWith("COLE_")
  && !firebaseConfig.projectId.startsWith("COLE_")
  && firebaseConfig.databaseURL.startsWith("https://");

if (firebaseIsConfigured && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
