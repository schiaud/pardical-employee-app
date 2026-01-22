// Car-part.com options data utilities
import carPartOptions from './car_part_options.json';

interface MakeModel {
  value: string;
  text: string;
}

interface Part {
  value: string;
  text: string;
}

interface CarPartOptions {
  make_model: MakeModel[];
  part: Part[];
}

const options = carPartOptions as CarPartOptions;

// Generate years from 1990 to current year + 1
export const getYears = (): number[] => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let year = currentYear + 1; year >= 1990; year--) {
    years.push(year);
  }
  return years;
};

// Get unique makes from make_model list
export const getMakes = (): string[] => {
  const makes = new Set<string>();
  options.make_model.forEach((mm) => {
    // Format is "Make Model" - extract make (first word, or first two for multi-word makes)
    const parts = mm.value.split(' ');
    // Handle multi-word makes like "Alfa Romeo", "Aston Martin", "Land Rover"
    const knownMultiWordMakes = [
      'Alfa', 'Am General', 'Aston Martin', 'Land Rover', 'Mercedes Benz',
      'Rolls Royce'
    ];

    if (knownMultiWordMakes.some(m => mm.value.startsWith(m))) {
      // Find which multi-word make it starts with
      const matchedMake = knownMultiWordMakes.find(m => mm.value.startsWith(m));
      if (matchedMake) {
        makes.add(matchedMake);
      }
    } else {
      // Single word make
      makes.add(parts[0]);
    }
  });

  return Array.from(makes).sort();
};

// Get models for a specific make
export const getModelsForMake = (make: string): string[] => {
  const models: string[] = [];

  options.make_model.forEach((mm) => {
    if (mm.value.startsWith(make + ' ')) {
      // Extract model (everything after the make)
      const model = mm.value.substring(make.length + 1);
      if (model) {
        models.push(model);
      }
    }
  });

  return models.sort();
};

// Get make_model value for API (combines make + model)
export const getMakeModelValue = (make: string, model: string): string => {
  return `${make} ${model}`;
};

// Get all parts
export const getParts = (): Part[] => {
  return options.part.sort((a, b) => a.text.localeCompare(b.text));
};

// Search parts by keyword
export const searchParts = (query: string, limit: number = 20): Part[] => {
  const lowerQuery = query.toLowerCase();
  const results = options.part.filter((part) =>
    part.text.toLowerCase().includes(lowerQuery)
  );
  return results.slice(0, limit).sort((a, b) => {
    // Prioritize matches at the start of the text
    const aStartsWith = a.text.toLowerCase().startsWith(lowerQuery);
    const bStartsWith = b.text.toLowerCase().startsWith(lowerQuery);
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    return a.text.localeCompare(b.text);
  });
};

// Get part value by text (for API calls)
export const getPartValue = (text: string): string | undefined => {
  const part = options.part.find((p) => p.text === text);
  return part?.value;
};

// Get part text by value
export const getPartText = (value: string): string | undefined => {
  const part = options.part.find((p) => p.value === value);
  return part?.text;
};

// Export raw data for direct access if needed
export const getRawMakeModels = (): MakeModel[] => options.make_model;
export const getRawParts = (): Part[] => options.part;
