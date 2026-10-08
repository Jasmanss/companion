/// <reference types="vite/client" />
import type { CompanionAPI } from '../../shared/types'

declare global {
  interface Window {
    companion: CompanionAPI
  }
}
