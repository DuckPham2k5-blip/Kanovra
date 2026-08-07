import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Đăng nhập" };

export default function SignInPage() {
  return <SignIn appearance={{ elements: { rootBox: "w-full", card: "shadow-lg" } }} />;
}
