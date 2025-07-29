import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
} from "react"
import { EnhancedBoxContainer } from "./EnhancedBoxContainer"
import { EnhancedBoxItem } from "./EnhancedBoxItem"
import { Input } from "@/components/ui/input"

interface DashboardData {
  label: string
  value: string | number
}

interface EnhancedBoxDashboardProps {
  data: DashboardData[]
  onItemClick?: (item: DashboardData) => void
  title?: string
  debounceMs?: number
  noResultsMessage?: string
}

export const EnhancedBoxDashboard: React.FC<EnhancedBoxDashboardProps> = ({
  data,
  onItemClick,
  title = "Dashboard Overview",
  debounceMs = 300,
  noResultsMessage = "No matching items found",
}) => {
  const [searchTerm, setSearchTerm] = useState<string>("")
  const [debouncedSearch, setDebouncedSearch] = useState<string>("")

  // Debounce the search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm)
    }, debounceMs)
    return () => clearTimeout(handler)
  }, [searchTerm, debounceMs])

  const filtered = useMemo(
    () =>
      data.filter(d =>
        d.label.toLowerCase().includes(debouncedSearch.toLowerCase())
      ),
    [data, debouncedSearch]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchTerm(e.target.value)
    },
    []
  )

  const handleItemClick = useCallback(
    (item: DashboardData) => {
      if (onItemClick) {
        onItemClick(item)
      } else {
        console.log(\`Clicked: \${item.label}\`)
      }
    },
    [onItemClick]
  )

  return (
    <EnhancedBoxContainer title={title}>
      <div className="mb-4">
        <Input
          placeholder="Search..."
          value={searchTerm}
          onChange={handleChange}
          aria-label="Search dashboard items"
        />
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => (
            <EnhancedBoxItem
              key={item.label}
              label={item.label}
              value={item.value}
              onClick={() => handleItemClick(item)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center text-muted">
          {noResultsMessage}
        </div>
      )}
    </EnhancedBoxContainer>
  )
}
