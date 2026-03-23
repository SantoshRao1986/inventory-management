import { ref } from 'vue'

// Singleton budget ref — persists across tab navigation for the session
const budget = ref(10000)

export function useRestocking() {
  return { budget }
}
