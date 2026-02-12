declare module "#auth-utils" {
  interface User {
    id: number;
    name: string;
    photo: string;
  }

  interface UserSession {
    // Add your own fields
  }

  interface SecureSessionData {
    // Add your own fields
  }
}

export {};
