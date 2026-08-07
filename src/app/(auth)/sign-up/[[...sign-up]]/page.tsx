import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Đăng ký" };

export default function SignUpPage() {
  return <SignUp appearance={{ elements: { rootBox: "w-full", card: "shadow-lg" } }} />;
}
