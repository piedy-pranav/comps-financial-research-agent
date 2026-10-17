import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { validateQuestion } from "@/lib/validation";

// PLACEHOLDER (Step 1). Proves auth, validation, and the runs table are wired up.
// Step 2 replaces the dummy answer with: usage check (lib/usage.ts), the ReAct
// loop (lib/agent/loop.ts), a streamed trace, and saving 'failed' runs too.
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Please log in to ask a question." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Send a JSON body like { "question": "..." }.' },
        { status: 400 },
      );
    }

    const validation = validateQuestion((body as { question?: unknown } | null)?.question);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { question } = validation;

    const answer =
      "This is a placeholder answer. The Comps agent isn't connected yet, so no SEC data was used. " +
      `Your question was saved: "${question}"`;
    const trace: unknown[] = [];

    const { error: dbError } = await createAdminClient()
      .from("runs")
      .insert({ user_id: user.id, question, answer, trace, status: "success" });

    if (dbError) {
      console.error("[api/agent] failed to save run:", dbError.message);
      return NextResponse.json(
        { error: "We couldn't save your question. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({ answer, trace });
  } catch (err) {
    console.error("[api/agent]", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
