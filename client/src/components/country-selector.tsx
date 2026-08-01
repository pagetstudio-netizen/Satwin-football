import { useQuery } from "@tanstack/react-query";
import { FALLBACK_COUNTRIES, type ApiCountry } from "@/lib/countries";
import { ChevronLeft } from "lucide-react";

interface CountrySelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (countryCode: string) => void;
}

export function CountrySelector({ open, onClose, onSelect }: CountrySelectorProps) {
  const { data: apiCountries } = useQuery<ApiCountry[]>({
    queryKey: ["/api/countries"],
    enabled: open,
  });

  const displayCountries = (apiCountries && apiCountries.length > 0)
    ? apiCountries.filter(c => c.isActive).map(c => ({
        code: c.code,
        name: c.name,
        phonePrefix: c.phonePrefix,
      }))
    : FALLBACK_COUNTRIES.map(c => ({
        code: c.code,
        name: c.name,
        phonePrefix: c.phonePrefix,
      }));

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: "#2e7d32" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center px-4 py-4 gap-3">
          <button
            onClick={onClose}
            className="text-white p-1"
            data-testid="button-close-country"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="flex-1 text-center text-white font-bold text-base pr-8">
            Sélectionnez votre pays
          </h2>
        </div>

        {/* Country list */}
        <div className="flex flex-col gap-2 px-4 pb-5">
          {displayCountries.map((country) => (
            <button
              key={country.code}
              onClick={() => {
                onSelect(country.code);
                onClose();
              }}
              className="w-full bg-white rounded-xl flex items-center justify-between px-4 py-4"
              data-testid={`country-option-${country.code}`}
            >
              <span className="text-gray-800 font-medium text-sm">+{country.phonePrefix}</span>
              <span className="text-gray-800 font-medium text-sm">{country.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
