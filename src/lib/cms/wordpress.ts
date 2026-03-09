interface WordPressPost {
  id?: number;
  title: string;
  content: string;
  excerpt?: string;
  status: "draft" | "publish" | "pending" | "private";
  featured_media?: number;
  categories?: number[];
  tags?: number[];
}

interface WordPressMedia {
  id: number;
  source_url: string;
}

export class WordPressClient {
  private apiUrl: string;
  private username: string;
  private applicationPassword: string;

  constructor(apiUrl: string, username: string, applicationPassword: string) {
    // Ensure API URL ends with /wp-json/wp/v2
    this.apiUrl = apiUrl.replace(/\/$/, "");
    if (!this.apiUrl.endsWith("/wp-json/wp/v2")) {
      this.apiUrl = `${this.apiUrl}/wp-json/wp/v2`;
    }
    this.username = username;
    this.applicationPassword = applicationPassword;
  }

  private getAuthHeaders(): HeadersInit {
    const credentials = Buffer.from(
      `${this.username}:${this.applicationPassword}`
    ).toString("base64");
    return {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.apiUrl}/users/me`, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Authentification échouée: ${error}` };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Impossible de se connecter: ${error instanceof Error ? error.message : "Erreur inconnue"}`,
      };
    }
  }

  async createPost(post: WordPressPost): Promise<{ id: number; link: string }> {
    const response = await fetch(`${this.apiUrl}/posts`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        title: post.title,
        content: post.content,
        excerpt: post.excerpt,
        status: post.status,
        featured_media: post.featured_media,
        categories: post.categories,
        tags: post.tags,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Échec de création: ${error}`);
    }

    const data = await response.json();
    return { id: data.id, link: data.link };
  }

  async updatePost(
    postId: number,
    post: Partial<WordPressPost>
  ): Promise<void> {
    const response = await fetch(`${this.apiUrl}/posts/${postId}`, {
      method: "PUT",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(post),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Échec de mise à jour: ${error}`);
    }
  }

  async uploadMedia(
    imageUrl: string,
    filename: string
  ): Promise<WordPressMedia> {
    // Fetch the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error("Impossible de télécharger l'image source");
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get("content-type") || "image/png";

    // Upload to WordPress
    const response = await fetch(`${this.apiUrl}/media`, {
      method: "POST",
      headers: {
        ...this.getAuthHeaders(),
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      body: imageBuffer,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Échec d'upload: ${error}`);
    }

    const data = await response.json();
    return { id: data.id, source_url: data.source_url };
  }

  async getCategories(): Promise<Array<{ id: number; name: string }>> {
    const response = await fetch(`${this.apiUrl}/categories?per_page=100`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error("Impossible de récupérer les catégories");
    }

    const data = await response.json();
    return data.map((cat: { id: number; name: string }) => ({
      id: cat.id,
      name: cat.name,
    }));
  }

  async getTags(): Promise<Array<{ id: number; name: string }>> {
    const response = await fetch(`${this.apiUrl}/tags?per_page=100`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error("Impossible de récupérer les tags");
    }

    const data = await response.json();
    return data.map((tag: { id: number; name: string }) => ({
      id: tag.id,
      name: tag.name,
    }));
  }
}

export async function publishToWordPress(
  cmsConfig: {
    apiUrl: string;
    username: string;
    apiKey: string;
  },
  post: {
    title: string;
    content: string;
    excerpt?: string;
    imageUrl?: string;
    status?: "draft" | "publish";
  }
): Promise<{ success: boolean; postId?: number; link?: string; error?: string }> {
  try {
    const client = new WordPressClient(
      cmsConfig.apiUrl,
      cmsConfig.username || "admin",
      cmsConfig.apiKey
    );

    // Test connection first
    const connectionTest = await client.testConnection();
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error };
    }

    // Upload featured image if provided
    let featuredMediaId: number | undefined;
    if (post.imageUrl) {
      try {
        const media = await client.uploadMedia(
          post.imageUrl,
          `${post.title.slice(0, 30).replace(/\s+/g, "-")}.png`
        );
        featuredMediaId = media.id;
      } catch (error) {
        console.error("Image upload failed:", error);
        // Continue without featured image
      }
    }

    // Create the post
    const result = await client.createPost({
      title: post.title,
      content: post.content,
      excerpt: post.excerpt,
      status: post.status || "draft",
      featured_media: featuredMediaId,
    });

    return {
      success: true,
      postId: result.id,
      link: result.link,
    };
  } catch (error) {
    console.error("WordPress publish error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }
}
