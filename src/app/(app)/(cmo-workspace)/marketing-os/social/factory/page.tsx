"use client";

import { useState, useCallback, useEffect } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Factory, LayoutGrid, Calendar as CalendarIcon, Sparkles, Repeat2, Megaphone } from "lucide-react";
import { StrategyForm } from "@/components/modules/social-factory/strategy-form";
import { GenerationProgress } from "@/components/modules/social-factory/generation-progress";
import { ProposalWall } from "@/components/modules/social-factory/proposal-wall";
import { FactoryCalendar } from "@/components/modules/social-factory/factory-calendar";
import { getContentPlan, listContentPlans } from "@/actions/social-factory";
import { RepurposingTab } from "@/components/modules/repurposing-tab";
import { CampaignTab } from "@/components/modules/campaign-tab";
import type { MarketingPersona, ContentConcept } from "@/lib/services/social/content-factory";
import type { PostType } from "@prisma/client";


interface PlanData {
  id: string;
  status: string;
  month: number;
  year: number;
  totalConcepts: number;
  completed: number;
  failed: number;
  conceptsData: ContentConcept[] | null;
  posts: Array<{
    id: string;
    type: PostType;
    title: string | null;
    content: string;
    excerpt: string | null;
    imageUrl: string | null;
    keywords: string[];
    status: string;
    scheduledAt: string | null;
    createdAt: string;
  }>;
}

export default function ContentFactoryPage() {
  const { workspaceId } = useWorkspace();
  const [activeTab, setActiveTab] = useState("strategy");
  const [contentPlanId, setContentPlanId] = useState<string | null>(null);
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Load existing plan data
  const loadPlanData = useCallback(async (planId: string) => {
    const result = await getContentPlan(planId);
    if (result.success && result.data) {
      setPlanData({
        id: result.data.id,
        status: result.data.status,
        month: result.data.month,
        year: result.data.year,
        totalConcepts: result.data.totalConcepts,
        completed: result.data.completed,
        failed: result.data.failed,
        conceptsData: result.data.conceptsData as ContentConcept[] | null,
        posts: result.data.posts.map((p) => ({
          ...p,
          scheduledAt: p.scheduledAt?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
        })),
      });
    }
  }, []);

  const handlePlanCreated = useCallback(
    (planId: string) => {
      setContentPlanId(planId);
      setIsGenerating(true);
      setActiveTab("strategy");
    },
    []
  );

  const handleGenerationComplete = useCallback(() => {
    setIsGenerating(false);
    if (contentPlanId) {
      loadPlanData(contentPlanId);
      setActiveTab("proposals");
    }
  }, [contentPlanId, loadPlanData]);

  // Load plan data when planId changes
  useEffect(() => {
    if (contentPlanId && !isGenerating) {
      loadPlanData(contentPlanId);
    }
  }, [contentPlanId, isGenerating, loadPlanData]);

  const concepts = planData?.conceptsData ?? [];
  const posts = planData?.posts ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Factory className="h-7 w-7 text-emerald-600" />
            Content Factory
          </h1>
          <p className="text-gray-500 mt-1">
            Générez 30 posts data-driven pour le mois prochain
          </p>
        </div>
        {planData && (
          <Badge
            variant={
              planData.status === "COMPLETED"
                ? "default"
                : planData.status === "GENERATING"
                ? "secondary"
                : "outline"
            }
          >
            {planData.status === "COMPLETED" && `${posts.length} posts générés`}
            {planData.status === "GENERATING" && "Génération en cours..."}
            {planData.status === "PENDING" && "En attente"}
            {planData.status === "FAILED" && "Échec"}
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="strategy" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Stratégie
          </TabsTrigger>
          <TabsTrigger value="proposals" className="gap-2" disabled={concepts.length === 0}>
            <LayoutGrid className="h-4 w-4" />
            Propositions ({concepts.length})
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2" disabled={posts.length === 0}>
            <CalendarIcon className="h-4 w-4" />
            Calendrier ({posts.length})
          </TabsTrigger>
          <TabsTrigger value="repurposing" className="gap-2">
            <Repeat2 className="h-4 w-4" />
            Repurposing
          </TabsTrigger>
          <TabsTrigger value="campaign" className="gap-2">
            <Megaphone className="h-4 w-4" />
            Campagnes
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Strategy */}
        <TabsContent value="strategy" className="space-y-4">
          <StrategyForm
            workspaceId={workspaceId ?? ""}
            onPlanCreated={handlePlanCreated}
          />
          {isGenerating && contentPlanId && (
            <GenerationProgress
              contentPlanId={contentPlanId}
              onComplete={handleGenerationComplete}
            />
          )}
        </TabsContent>

        {/* Tab 2: Proposals */}
        <TabsContent value="proposals">
          {concepts.length > 0 && contentPlanId && (
            <ProposalWall
              contentPlanId={contentPlanId}
              concepts={concepts}
              posts={posts}
            />
          )}
        </TabsContent>

        {/* Tab 3: Calendar */}
        <TabsContent value="calendar">
          {posts.length > 0 && planData && (
            <FactoryCalendar
              posts={posts}
              month={planData.month}
              year={planData.year}
              workspaceId={workspaceId ?? ""}
            />
          )}
        </TabsContent>

        {/* Tab 4: Repurposing */}
        <TabsContent value="repurposing">
          <RepurposingTab />
        </TabsContent>

        {/* Tab 5: Campagnes */}
        <TabsContent value="campaign">
          <CampaignTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
