<template>
  <div class="restocking">
    <div class="page-header">
      <h2>Restocking</h2>
      <p>Budget-based restock recommendations</p>
    </div>

    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
      <div class="card budget-card">
        <div class="card-header">
          <h3 class="card-title">Available Budget</h3>
          <span class="budget-value">${{ budget.toLocaleString() }}</span>
        </div>
        <div class="slider-container">
          <input
            type="range"
            class="budget-slider"
            :min="1000"
            :max="100000"
            :step="500"
            v-model.number="budget"
          />
          <div class="slider-labels">
            <span>$1,000</span>
            <span>$100,000</span>
          </div>
        </div>
      </div>

      <div v-if="successMessage" class="success-banner">{{ successMessage }}</div>

      <div v-if="recommendedItems.length > 0" class="card">
        <div class="card-header">
          <h3 class="card-title">Recommended Items ({{ recommendedItems.length }})</h3>
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Item</th>
                <th>Trend</th>
                <th>Demand Gap</th>
                <th>Qty to Order</th>
                <th>Unit Cost</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in recommendedItems" :key="item.sku">
                <td><strong>{{ item.sku }}</strong></td>
                <td>{{ item.name }}</td>
                <td>
                  <span :class="['badge', item.trend]">{{ item.trend }}</span>
                </td>
                <td>{{ item.demand_gap }}</td>
                <td>{{ item.quantity }}</td>
                <td>${{ item.unit_cost.toLocaleString() }}</td>
                <td><strong>${{ item.subtotal.toLocaleString() }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="budget-summary">
          <span class="summary-item">
            <span class="summary-label">Total Cost:</span>
            <span class="summary-value">${{ totalCost.toLocaleString() }}</span>
          </span>
          <span class="summary-item">
            <span class="summary-label">Remaining:</span>
            <span class="summary-value remaining">${{ remainingBudget.toLocaleString() }}</span>
          </span>
          <button
            class="btn-place-order"
            :disabled="loading"
            @click="placeOrder"
          >
            Place Order
          </button>
        </div>
      </div>

      <div v-else class="card empty-state">
        <p>No items to restock within this budget. Try increasing the budget.</p>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { useRestocking } from '../composables/useRestocking'

export default {
  name: 'Restocking',
  setup() {
    const router = useRouter()
    const { budget } = useRestocking()

    const demandForecasts = ref([])
    const inventoryItems = ref([])
    const loading = ref(false)
    const error = ref(null)
    const successMessage = ref(null)

    const recommendedItems = computed(() => {
      if (!demandForecasts.value.length || !inventoryItems.value.length) return []

      // Build a SKU -> unit_cost lookup from inventory
      const inventoryMap = {}
      for (const inv of inventoryItems.value) {
        inventoryMap[inv.sku] = inv
      }

      // Join demand forecasts with inventory, compute demand_gap
      const candidates = []
      for (const forecast of demandForecasts.value) {
        const inv = inventoryMap[forecast.item_sku]
        if (!inv) continue

        const demand_gap = forecast.forecasted_demand - forecast.current_demand
        if (demand_gap <= 0) continue

        candidates.push({
          sku: forecast.item_sku,
          name: forecast.item_name || inv.name,
          trend: forecast.trend,
          demand_gap,
          unit_cost: inv.unit_cost
        })
      }

      // Sort: increasing trend first, then by demand_gap descending within each group
      candidates.sort((a, b) => {
        const trendOrder = { increasing: 0, stable: 1, decreasing: 2 }
        const trendDiff = (trendOrder[a.trend] ?? 1) - (trendOrder[b.trend] ?? 1)
        if (trendDiff !== 0) return trendDiff
        return b.demand_gap - a.demand_gap
      })

      // Greedy selection
      let remaining = budget.value
      const selected = []

      for (const candidate of candidates) {
        if (remaining <= 0) break

        const fullCost = candidate.unit_cost * candidate.demand_gap

        let quantity
        if (fullCost <= remaining) {
          quantity = candidate.demand_gap
        } else {
          quantity = Math.floor(remaining / candidate.unit_cost)
          if (quantity < 1) continue
        }

        const subtotal = quantity * candidate.unit_cost
        remaining -= subtotal

        selected.push({
          sku: candidate.sku,
          name: candidate.name,
          trend: candidate.trend,
          demand_gap: candidate.demand_gap,
          quantity,
          unit_cost: candidate.unit_cost,
          subtotal
        })
      }

      return selected
    })

    const totalCost = computed(() => {
      return recommendedItems.value.reduce((sum, item) => sum + item.subtotal, 0)
    })

    const remainingBudget = computed(() => {
      return budget.value - totalCost.value
    })

    const loadData = async () => {
      loading.value = true
      error.value = null
      try {
        const [forecasts, inventory] = await Promise.all([
          api.getDemandForecasts(),
          api.getInventory()
        ])
        demandForecasts.value = forecasts
        inventoryItems.value = inventory
      } catch (err) {
        error.value = 'Failed to load data'
        console.error(err)
      } finally {
        loading.value = false
      }
    }

    const placeOrder = async () => {
      try {
        await api.createRestockingOrder({
          items: recommendedItems.value.map(item => ({
            sku: item.sku,
            name: item.name,
            quantity: item.quantity,
            unit_price: item.unit_cost
          })),
          total_value: totalCost.value
        })
        successMessage.value = 'Restocking order placed successfully!'
        setTimeout(() => {
          successMessage.value = null
          router.push('/orders')
        }, 2000)
      } catch (err) {
        console.error('Failed to place restocking order:', err)
      }
    }

    onMounted(() => loadData())

    return {
      budget,
      loading,
      error,
      successMessage,
      recommendedItems,
      totalCost,
      remainingBudget,
      placeOrder
    }
  }
}
</script>

<style scoped>
.restocking {
  padding: 0;
}

.budget-card .card-header {
  margin-bottom: 1rem;
}

.budget-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.025em;
}

.slider-container {
  padding: 0 0.25rem;
}

.budget-slider {
  width: 100%;
  appearance: none;
  height: 6px;
  border-radius: 3px;
  background: #e2e8f0;
  outline: none;
  cursor: pointer;
  margin-bottom: 0.5rem;
}

.budget-slider::-webkit-slider-thumb {
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #2563eb;
  cursor: pointer;
  border: 2px solid #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  transition: background 0.15s ease;
}

.budget-slider::-webkit-slider-thumb:hover {
  background: #1d4ed8;
}

.budget-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #2563eb;
  cursor: pointer;
  border: 2px solid #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 0.25rem;
}

.budget-summary {
  display: flex;
  align-items: center;
  gap: 2rem;
  padding: 1rem 0.75rem 0.25rem;
  border-top: 1px solid #e2e8f0;
  margin-top: 0.75rem;
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.summary-label {
  font-size: 0.875rem;
  color: #64748b;
  font-weight: 500;
}

.summary-value {
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
}

.summary-value.remaining {
  color: #059669;
}

.btn-place-order {
  margin-left: auto;
  padding: 0.5rem 1.5rem;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-place-order:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-place-order:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: #64748b;
  font-size: 0.938rem;
}

.success-banner {
  background: #d1fae5;
  border: 1px solid #6ee7b7;
  color: #065f46;
  padding: 0.875rem 1.25rem;
  border-radius: 8px;
  margin-bottom: 1.25rem;
  font-size: 0.938rem;
  font-weight: 500;
}
</style>
