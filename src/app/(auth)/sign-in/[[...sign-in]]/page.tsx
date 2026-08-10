import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  // `w-full` alone stretches Clerk's root box across the column while the card
  // inside it keeps its own fixed width, which left it sitting against the left
  // edge instead of under the wordmark. The root box has to centre its child.
  return (
    <SignIn appearance={{ elements: { rootBox: "flex w-full justify-center", card: "shadow-lg" } }} />
  );
}
