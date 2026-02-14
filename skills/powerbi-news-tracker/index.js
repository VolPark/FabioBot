/**
 * PowerBI News Tracker Skill for OpenClaw
 *
 * Fetches latest Power BI and Fabric updates from official Microsoft sources.
 * Keeps the agent's knowledge current with new features, API changes, and best practices.
 */

const SOURCES = {
  powerbi_blog: {
    rss: "https://powerbi.microsoft.com/en-us/blog/feed/",
    label: "Power BI Blog",
  },
  fabric_blog: {
    rss: "https://blog.fabric.microsoft.com/en-us/blog/feed/",
    label: "Microsoft Fabric Blog",
  },
  powerbi_updates: {
    url: "https://learn.microsoft.com/en-us/power-bi/fundamentals/desktop-latest-update?tabs=powerbi-desktop",
    label: "Power BI Desktop Updates",
  },
  fabric_rest_api: {
    url: "https://learn.microsoft.com/en-us/rest/api/fabric/articles/using-fabric-apis",
    label: "Fabric REST API Docs",
  },
  dax_reference: {
    url: "https://learn.microsoft.com/en-us/dax/",
    label: "DAX Reference",
  },
};

/**
 * Simple XML tag content extractor (no external dependencies)
 */
function extractTag(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const matches = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[1].trim());
  }
  return matches;
}

/**
 * Strip CDATA wrappers and HTML tags
 */
function cleanContent(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fetch and parse an RSS feed
 */
async function fetchRssFeed(url, maxItems = 10) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "FabioBot/1.0 (Power BI Knowledge Tracker)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed: ${response.status} ${url}`);
  }

  const xml = await response.text();
  const titles = extractTag(xml, "title");
  const links = extractTag(xml, "link");
  const pubDates = extractTag(xml, "pubDate");
  const descriptions = extractTag(xml, "description");

  // Skip the feed-level title (first element)
  const items = [];
  for (let i = 1; i < titles.length && items.length < maxItems; i++) {
    items.push({
      title: cleanContent(titles[i]),
      link: cleanContent(links[i] || ""),
      date: pubDates[i - 1] ? cleanContent(pubDates[i - 1]) : "",
      summary: cleanContent(descriptions[i] || "").substring(0, 300),
    });
  }

  return items;
}

/**
 * Fetch a web page and extract text content
 */
async function fetchPageContent(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "FabioBot/1.0 (Power BI Knowledge Tracker)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.status} ${url}`);
  }

  const html = await response.text();

  // Extract main content area (Microsoft Learn pages)
  let content = html;
  const mainMatch = html.match(
    /<main[^>]*>([\s\S]*?)<\/main>/i
  );
  if (mainMatch) {
    content = mainMatch[1];
  }

  // Strip HTML and clean up
  return cleanContent(content).substring(0, 5000);
}

/**
 * Search Microsoft Learn for a specific topic
 */
async function searchMsLearn(query) {
  const searchUrl = `https://learn.microsoft.com/api/search?search=${encodeURIComponent(
    query
  )}&locale=en-us&facet=category&facet=products&%24filter=products%2Fany(p%3A%20p%20eq%20%27power-bi%27%20or%20p%20eq%20%27fabric%27)&%24top=8`;

  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent": "FabioBot/1.0 (Power BI Knowledge Tracker)",
    },
  });

  if (!response.ok) {
    // Fallback: return a direct search link
    return {
      results: [],
      searchUrl: `https://learn.microsoft.com/en-us/search/?terms=${encodeURIComponent(
        query
      )}&products=power-bi,fabric`,
    };
  }

  const data = await response.json();
  const results = (data.results || []).map((r) => ({
    title: r.title || "",
    url: r.url || "",
    description: (r.description || "").substring(0, 200),
    lastUpdated: r.lastUpdatedDate || "",
  }));

  return {
    results,
    searchUrl: `https://learn.microsoft.com/en-us/search/?terms=${encodeURIComponent(
      query
    )}&products=power-bi,fabric`,
  };
}

// ============================================================
// Exported skill handlers
// ============================================================

module.exports = {
  /**
   * Get latest Power BI and Fabric updates
   */
  get_powerbi_updates: async ({ topic, max_items } = {}) => {
    const maxItems = Math.min(max_items || 10, 25);
    const selectedTopic = (topic || "all").toLowerCase();

    const results = { timestamp: new Date().toISOString(), items: [] };

    try {
      if (selectedTopic === "all" || selectedTopic === "powerbi") {
        const pbiItems = await fetchRssFeed(
          SOURCES.powerbi_blog.rss,
          maxItems
        );
        results.items.push(
          ...pbiItems.map((item) => ({ ...item, source: "Power BI Blog" }))
        );
      }

      if (selectedTopic === "all" || selectedTopic === "fabric") {
        const fabricItems = await fetchRssFeed(
          SOURCES.fabric_blog.rss,
          maxItems
        );
        results.items.push(
          ...fabricItems.map((item) => ({
            ...item,
            source: "Fabric Blog",
          }))
        );
      }

      if (selectedTopic === "api-changes") {
        const apiDocs = await fetchPageContent(SOURCES.fabric_rest_api.url);
        results.items.push({
          title: "Fabric REST API Documentation",
          source: "Microsoft Learn",
          link: SOURCES.fabric_rest_api.url,
          summary: apiDocs.substring(0, 1000),
        });
      }

      if (selectedTopic === "dax") {
        const daxDocs = await fetchPageContent(SOURCES.dax_reference.url);
        results.items.push({
          title: "DAX Reference",
          source: "Microsoft Learn",
          link: SOURCES.dax_reference.url,
          summary: daxDocs.substring(0, 1000),
        });
      }

      if (selectedTopic === "visuals") {
        const search = await searchMsLearn(
          "Power BI custom visuals new features"
        );
        results.items.push(
          ...search.results.map((r) => ({
            title: r.title,
            link: r.url,
            summary: r.description,
            source: "Microsoft Learn",
            date: r.lastUpdated,
          }))
        );
      }

      // Sort by date (newest first)
      results.items.sort(
        (a, b) => new Date(b.date || 0) - new Date(a.date || 0)
      );

      // Limit total items
      results.items = results.items.slice(0, maxItems);
      results.total = results.items.length;
    } catch (error) {
      results.error = error.message;
    }

    return JSON.stringify(results, null, 2);
  },

  /**
   * Get details about a specific Power BI / Fabric feature
   */
  get_powerbi_feature_details: async ({ feature_name }) => {
    const search = await searchMsLearn(`Power BI Fabric ${feature_name}`);

    const result = {
      feature: feature_name,
      documentation: search.results,
      searchUrl: search.searchUrl,
    };

    // Try to fetch the top result's page content for more details
    if (search.results.length > 0 && search.results[0].url) {
      try {
        const pageContent = await fetchPageContent(search.results[0].url);
        result.details = pageContent.substring(0, 3000);
        result.primaryUrl = search.results[0].url;
      } catch {
        // Page fetch failed, search results are still useful
      }
    }

    return JSON.stringify(result, null, 2);
  },

  /**
   * Get Fabric/Power BI REST API changelog
   */
  get_fabric_api_changelog: async ({ since_days } = {}) => {
    const days = Math.min(since_days || 30, 90);

    // Fetch both the Fabric API docs and Power BI REST API what's new
    const [fabricSearch, pbiSearch] = await Promise.all([
      searchMsLearn("Fabric REST API changes new endpoints"),
      searchMsLearn("Power BI REST API updates changelog"),
    ]);

    // Also check the blog for API-related announcements
    let apiPosts = [];
    try {
      const allPosts = await fetchRssFeed(SOURCES.fabric_blog.rss, 25);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      apiPosts = allPosts.filter((post) => {
        const postDate = new Date(post.date);
        const isRecent = postDate >= cutoffDate;
        const isApiRelated =
          /api|rest|endpoint|sdk|developer/i.test(post.title) ||
          /api|rest|endpoint|sdk|developer/i.test(post.summary);
        return isRecent && isApiRelated;
      });
    } catch {
      // Blog fetch failed, continue with search results
    }

    const result = {
      period: `Last ${days} days`,
      timestamp: new Date().toISOString(),
      fabricApiDocs: fabricSearch.results,
      powerbiApiDocs: pbiSearch.results,
      recentApiPosts: apiPosts,
      references: {
        fabricApi:
          "https://learn.microsoft.com/en-us/rest/api/fabric/articles/using-fabric-apis",
        powerbiApi:
          "https://learn.microsoft.com/en-us/rest/api/power-bi/",
        changelog:
          "https://learn.microsoft.com/en-us/power-bi/fundamentals/desktop-latest-update",
      },
    };

    return JSON.stringify(result, null, 2);
  },

  /**
   * Look up DAX functions and patterns
   */
  get_dax_reference: async ({ query }) => {
    const search = await searchMsLearn(`DAX ${query}`);

    const result = {
      query,
      results: search.results,
      searchUrl: search.searchUrl,
    };

    // Fetch the top result for detailed content
    if (search.results.length > 0 && search.results[0].url) {
      try {
        const content = await fetchPageContent(search.results[0].url);
        result.details = content.substring(0, 3000);
        result.primaryUrl = search.results[0].url;
      } catch {
        // Fallback to search results
      }
    }

    // Add link to DAX guide
    result.daxGuide = "https://dax.guide/";
    result.daxReference = "https://learn.microsoft.com/en-us/dax/";

    return JSON.stringify(result, null, 2);
  },
};
