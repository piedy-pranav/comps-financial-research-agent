import type { Metadata } from "next";
import { AuditWorkspace } from "@/components/audit/audit-workspace";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = { title: "Comparability Audit · Comps" };

// Two-company financial comparability review over SEC XBRL data. Does not use research questions.
export default function AuditPage() {
  return (
    <AppShell section="Comparability Audit" requireUser>
      <AuditWorkspace />
    </AppShell>
  );
}
