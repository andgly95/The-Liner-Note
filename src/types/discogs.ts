export interface DiscogsUser {
  id: number;
  username: string;
  resource_url: string;
  consumer_name: string;
  avatar_url?: string;
}

export interface DiscogsArtist {
  name: string;
  anv: string;
  join: string;
  role: string;
  tracks: string;
  id: number;
  resource_url: string;
}

export interface DiscogsLabel {
  name: string;
  catno: string;
  entity_type: string;
  entity_type_name: string;
  id: number;
  resource_url: string;
}

export interface DiscogsFormat {
  name: string;
  qty: string;
  text?: string;
  descriptions?: string[];
}

export interface DiscogsBasicInfo {
  id: number;
  master_id: number;
  master_url: string | null;
  resource_url: string;
  thumb: string;
  cover_image: string;
  title: string;
  year: number;
  formats: DiscogsFormat[];
  artists: DiscogsArtist[];
  labels: DiscogsLabel[];
  genres: string[];
  styles: string[];
}

export interface DiscogsCollectionItem {
  id: number;
  instance_id: number;
  date_added: string;
  rating: number;
  basic_information: DiscogsBasicInfo;
  notes?: Array<{ field_id: number; value: string }>;
}

export interface DiscogsWantlistItem {
  id: number;
  resource_url: string;
  date_added: string;
  rating: number;
  basic_information: DiscogsBasicInfo;
  notes?: string;
}

export interface DiscogsPagination {
  page: number;
  pages: number;
  per_page: number;
  items: number;
  urls: {
    first?: string;
    last?: string;
    prev?: string;
    next?: string;
  };
}

export interface DiscogsCollectionResponse {
  pagination: DiscogsPagination;
  releases: DiscogsCollectionItem[];
}

export interface DiscogsWantlistResponse {
  pagination: DiscogsPagination;
  wants: DiscogsWantlistItem[];
}

export interface DiscogsTrack {
  position: string;
  title: string;
  duration?: string;
  type_?: string;
}

export interface DiscogsReleaseDetail {
  id: number;
  title: string;
  artists: DiscogsArtist[];
  year?: number;
  tracklist: DiscogsTrack[];
  genres?: string[];
  styles?: string[];
}

export interface DiscogsOAuthTokens {
  accessToken: string;
  accessTokenSecret: string;
}

export interface DiscogsSession {
  user: DiscogsUser;
  tokens: DiscogsOAuthTokens;
}

// Compressed format for LLM consumption
export interface CompressedRelease {
  artist: string;
  album: string;
  year: number;
  genres: string[];
  styles: string[];
  format: string;
  dateAdded?: string;
  rating?: number;
}

export interface CompressedCollection {
  username: string;
  totalItems: number;
  releases: CompressedRelease[];
  truncated: boolean;
  truncatedAt?: number;
}
