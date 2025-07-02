
import React, { useState, useMemo } from "react"
import { EnhancedBoxContainer } from "./EnhancedBoxContainer"
import { EnhancedBoxItem } from "./EnhancedBoxItem"
import { Input } from "@/components/ui/input"

interface DashboardData {
  label: string
  value: string | number
}

interface EnhancedBoxDashboardProps {
  data: DashboardData[]
}

export const EnhancedBoxDashboard: React.FC<EnhancedBoxDashboardProps> = ({ data }) => {
  const [search, setSearch] = useState("")

  const filtered = useMemo(
    () =>
      data.filter(d =>
        d.label.toLowerCase().includes(search.toLowerCase())
      ),
    [data, search]
  )

  return (
    <EnhancedBoxContainer title="Dashboard Overview">
      <div className="mb-4">
        <Input
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((item, idx) => (
          <EnhancedBoxItem
            key={idx}
            label={item.label}
            value={item.value}
            onClick={() => console.log(`Clicked: ${item.label}`)}
          />
        ))}
      </div>
    </EnhancedBoxContainer>
  )
}
