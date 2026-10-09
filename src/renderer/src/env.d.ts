/// <reference types="vite/client" />
import type { StewardAPI } from '../../shared/types'

declare global {
  interface Window {
    steward: StewardAPI
  }
}
