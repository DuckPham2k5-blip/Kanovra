import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign up" };

export default function SignUpPage() {
  // Same centring fix as the sign-in page.
  return (
    <SignUp appearance={{ elements: { rootBox: "flex w-full justify-center", card: "shadow-lg" } }} />
  );
}
