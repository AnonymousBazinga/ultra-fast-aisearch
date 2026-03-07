export interface SearchResult {
  title: string;
  url: string;
  text?: string;
  highlights?: string[];
  publishedDate?: string;
  author?: string;
  score?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  autopromptString?: string;
}

export interface ResearchStep {
  id: string;
  query: string;
  status: "searching" | "synthesizing" | "done";
  results: SearchResult[];
  synthesis: string;
  depth: number; // 0 = initial, 1+ = follow-ups
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  searchQuery?: string;
  searchResults?: SearchResult[];
  searchStatus?: "searching" | "done";
  isDeepResearch?: boolean;
  researchSteps?: ResearchStep[];
  researchStatus?: "researching" | "answering" | "done";
  allSources?: SearchResult[]; // accumulated across all steps
  timestamp: number;
}
