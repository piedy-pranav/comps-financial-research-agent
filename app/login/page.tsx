import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Log in · Comps" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const initialError =
    error === "confirm"
      ? "That confirmation link is invalid or expired. Try logging in or signing up again."
      : undefined;

  return <AuthForm mode="login" initialError={initialError} />;
}
