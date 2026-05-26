export interface Alias {
  id: string
  email: string
  forward_email: string
  active: boolean
  metadata: {
    comment: string
    service_name: string
  }
}

export interface ProtectedAddress {
  id: string
  email: string
  active: boolean
}

export interface PaginatedAliases {
  aliases: Alias[]
  pagination_metadata: {
    current_page: number
    page_size: number
    first_page: number
    last_page: number
    total_records: number
  }
}

export interface PaginatedProtectedAddresses {
  protected_addresses: ProtectedAddress[]
  pagination_metadata: {
    current_page: number
    page_size: number
    first_page: number
    last_page: number
    total_records: number
  }
}

export interface StorageData {
  serverUrl?: string
  jwt?: string
  jwtExpiry?: number
  pendingAuthTabId?: number
  lastProvider?: string
}
