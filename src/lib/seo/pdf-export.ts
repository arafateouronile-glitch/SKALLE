/**
 * 📄 Export PDF - SEO Strategy Report
 * 
 * Génère un PDF professionnel du rapport SEO Intelligence
 */

interface AuditData {
  url: string;
  globalScore: number;
  metadata: {
    title: string | null;
    description: string | null;
    h1: string | null;
    theme: string;
  } | null;
  targetKeywords: Array<{
    term: string;
    intent: string;
    difficulty: "easy" | "medium" | "hard";
    priority: boolean;
    volumeEstimate: "low" | "medium" | "high";
  }> | null;
  competitors: Array<{
    domain: string;
    strength: string[];
    weakness: string[];
    authorityScore: number;
  }> | null;
  actionPlan: {
    technicalActions: Array<{
      priority: "high" | "medium" | "low";
      action: string;
      description: string;
      estimatedImpact: number;
    }>;
    semanticGap: Array<{
      topic: string;
      competitors: string[];
      recommendation: string;
    }>;
    quickWins: Array<{
      keyword: string;
      difficulty: "easy" | "medium" | "hard";
      opportunity: string;
      estimatedImpact: number;
    }>;
    swot: {
      strengths: string[];
      weaknesses: string[];
      opportunities: string[];
      threats: string[];
    };
  } | null;
  updatedAt: string;
}

/**
 * Génère un PDF du rapport SEO Intelligence
 */
export async function generateSEOReportPDF(audit: AuditData): Promise<Blob> {
  // Import dynamique de jsPDF pour éviter les erreurs SSR
  const { jsPDF } = await import("jspdf");
  
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let yPosition = margin;

  // Couleurs (tuples pour setFillColor/setTextColor)
  const primaryColor: [number, number, number] = [139, 92, 246]; // Purple
  const successColor: [number, number, number] = [16, 185, 129]; // Green
  const warningColor: [number, number, number] = [245, 158, 11]; // Yellow
  const dangerColor: [number, number, number] = [239, 68, 68]; // Red

  // Fonction helper pour ajouter du texte avec wrap
  const addText = (text: string, x: number, y: number, options: any = {}) => {
    const maxWidth = options.maxWidth || contentWidth;
    const fontSize = options.fontSize || 10;
    doc.setFontSize(fontSize);
    const col = (options.color || [0, 0, 0]) as [number, number, number];
    doc.setTextColor(col[0], col[1], col[2]);
    
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);
    return lines.length * (fontSize * 0.4) + 2;
  };

  // Fonction helper pour vérifier si on doit ajouter une nouvelle page
  const checkNewPage = (requiredSpace: number) => {
    if (yPosition + requiredSpace > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
      return true;
    }
    return false;
  };

  // Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("SEO Strategy Report", margin, 20);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Rapport généré le ${new Date(audit.updatedAt).toLocaleDateString("fr-FR")}`, margin, 27);
  
  yPosition = 40;

  // Score Global
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Score SEO Global", margin, yPosition);
  yPosition += 8;

  doc.setFontSize(48);
  doc.setFont("helvetica", "bold");
  const scoreColor = audit.globalScore >= 80 ? successColor : audit.globalScore >= 60 ? warningColor : dangerColor;
  doc.setTextColor(...scoreColor);
  doc.text(`${audit.globalScore}/100`, margin, yPosition);
  yPosition += 15;

  // Informations du site
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Informations du Site", margin, yPosition);
  yPosition += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (audit.metadata) {
    yPosition += addText(`URL: ${audit.url}`, margin, yPosition, { fontSize: 10 });
    if (audit.metadata.title) {
      yPosition += addText(`Titre: ${audit.metadata.title}`, margin, yPosition, { fontSize: 10 });
    }
    if (audit.metadata.theme) {
      yPosition += addText(`Thématique: ${audit.metadata.theme}`, margin, yPosition, { fontSize: 10 });
    }
  }
  yPosition += 5;

  // Top Keywords
  if (audit.targetKeywords && audit.targetKeywords.length > 0) {
    checkNewPage(30);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Mots-clés Prioritaires", margin, yPosition);
    yPosition += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    audit.targetKeywords.slice(0, 10).forEach((keyword) => {
      checkNewPage(8);
      const difficulty = keyword.difficulty === "easy" ? "Facile" : keyword.difficulty === "medium" ? "Moyen" : "Difficile";
      const priority = keyword.priority ? "⭐" : "";
      yPosition += addText(
        `• ${keyword.term} (${difficulty}) ${priority}`,
        margin + 5,
        yPosition,
        { fontSize: 10 }
      );
    });
    yPosition += 5;
  }

  // Quick Wins
  if (audit.actionPlan?.quickWins && audit.actionPlan.quickWins.length > 0) {
    checkNewPage(30);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...warningColor);
    doc.text("Quick Wins", margin, yPosition);
    yPosition += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    audit.actionPlan.quickWins.slice(0, 5).forEach((win) => {
      checkNewPage(12);
      yPosition += addText(
        `• ${win.keyword} (Impact: ${win.estimatedImpact}/5)`,
        margin + 5,
        yPosition,
        { fontSize: 10, color: warningColor }
      );
      yPosition += addText(win.opportunity, margin + 10, yPosition, { fontSize: 9 });
      yPosition += 3;
    });
    yPosition += 5;
  }

  // Actions Techniques
  if (audit.actionPlan?.technicalActions && audit.actionPlan.technicalActions.length > 0) {
    checkNewPage(30);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Actions Techniques", margin, yPosition);
    yPosition += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    audit.actionPlan.technicalActions.forEach((action) => {
      checkNewPage(12);
      const priorityText = action.priority === "high" ? "🔴 Haute" : action.priority === "medium" ? "🟡 Moyenne" : "🟢 Basse";
      yPosition += addText(
        `• ${action.action} (${priorityText})`,
        margin + 5,
        yPosition,
        { fontSize: 10 }
      );
      yPosition += addText(action.description, margin + 10, yPosition, { fontSize: 9 });
      yPosition += 3;
    });
    yPosition += 5;
  }

  // Analyse SWOT
  if (audit.actionPlan?.swot) {
    checkNewPage(40);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Analyse SWOT", margin, yPosition);
    yPosition += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    // Forces
    if (audit.actionPlan.swot.strengths.length > 0) {
      checkNewPage(15);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...successColor);
      yPosition += addText("Forces", margin + 5, yPosition, { fontSize: 11 });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      audit.actionPlan.swot.strengths.forEach((strength) => {
        checkNewPage(6);
        yPosition += addText(`• ${strength}`, margin + 10, yPosition, { fontSize: 9 });
      });
      yPosition += 3;
    }

    // Faiblesses
    if (audit.actionPlan.swot.weaknesses.length > 0) {
      checkNewPage(15);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...dangerColor);
      yPosition += addText("Faiblesses", margin + 5, yPosition, { fontSize: 11 });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      audit.actionPlan.swot.weaknesses.forEach((weakness) => {
        checkNewPage(6);
        yPosition += addText(`• ${weakness}`, margin + 10, yPosition, { fontSize: 9 });
      });
      yPosition += 3;
    }

    // Opportunités
    if (audit.actionPlan.swot.opportunities.length > 0) {
      checkNewPage(15);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...warningColor);
      yPosition += addText("Opportunités", margin + 5, yPosition, { fontSize: 11 });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      audit.actionPlan.swot.opportunities.forEach((opportunity) => {
        checkNewPage(6);
        yPosition += addText(`• ${opportunity}`, margin + 10, yPosition, { fontSize: 9 });
      });
      yPosition += 3;
    }

    // Menaces
    if (audit.actionPlan.swot.threats.length > 0) {
      checkNewPage(15);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...dangerColor);
      yPosition += addText("Menaces", margin + 5, yPosition, { fontSize: 11 });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      audit.actionPlan.swot.threats.forEach((threat) => {
        checkNewPage(6);
        yPosition += addText(`• ${threat}`, margin + 10, yPosition, { fontSize: 9 });
      });
    }
  }

  // Footer sur chaque page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Page ${i} sur ${totalPages} - SEO Strategy Report - Skalle`,
      pageWidth / 2,
      pageHeight - 10,
      { align: "center" }
    );
  }

  // Générer le blob
  const pdfBlob = doc.output("blob");
  return pdfBlob;
}

/**
 * Télécharge le PDF généré
 */
export function downloadPDF(blob: Blob, filename: string = "seo-strategy-report.pdf") {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
