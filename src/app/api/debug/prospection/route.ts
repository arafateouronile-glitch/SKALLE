import { NextResponse } from "next/server";
import { qualifyProspectSearch } from "@/actions/leads";
import { findQualifiedLeads } from "@/lib/prospection/enrichment";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userQuery = searchParams.get("query") || "gérants d'organismes de formation en Île-de-France";

  const steps: Record<string, unknown> = { userQuery };

  // Step 1 : qualification IA (action réelle)
  const qualResult = await qualifyProspectSearch(userQuery);
  steps.aiCriteria = qualResult.criteria;
  steps.aiSummary = qualResult.summary;
  steps.aiError = qualResult.error;

  if (!qualResult.success || !qualResult.criteria) {
    return NextResponse.json(steps, { status: 200 });
  }

  const c = qualResult.criteria;

  // Step 2 : recherche avec les critères IA (max 5 leads, 3 locations max)
  const result = await findQualifiedLeads({
    jobTitles: c.jobTitles,
    industries: c.industries,
    locations: c.locations.slice(0, 3),
    keywords: c.keywords,
    searchMode: c.searchMode,
    requireEmail: false,
    requirePhone: false,
    limit: 5,
  });

  steps.searchResult = {
    success: result.success,
    leadsCount: result.leads?.length ?? 0,
    error: result.error,
    leads: result.leads?.slice(0, 3).map(l => ({
      name: l.name,
      company: l.company,
      location: l.location,
      website: l.enrichmentData?.websiteUrl,
    })),
  };

  return NextResponse.json(steps, { status: 200 });
}
