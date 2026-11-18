# Italian CAP Comuni Province — maintained fork

🇮🇹 **Complete TypeScript library for Italian locations: municipalities, provinces, postal codes with advanced search and autocomplete**

This is the personal fork maintained by [marlenesco](https://github.com/marlenesco),
based on [SpritzCoder's original project](https://github.com/spritzcoder/italian-cap-comuni-province).
It uses the separate npm name `@marlenesco/italian-cap-comuni-province`; the original
package and its ownership remain independent. Install the `latest` release for
the current API and datasets.

A TypeScript library providing access to Italian municipalities, provinces, and regions with search, postal-code lookup, and autocomplete support. Browser code that only checks postal-code membership should use the compact `/cap` entry point.

## ✨ Features

- 🚀 **High Performance**: Optimized searches with in-memory indices (O(1) lookups)
- 📦 **CAP-only Entry Point**: Check postal-code membership without loading geographic records
- 🔍 **Smart Search**: Advanced algorithms with relevance scoring (Jaro-Winkler similarity)
- 🎯 **TypeScript Native**: Full type safety and IntelliSense support
- 📱 **Zero Dependencies**: No external libraries required
- 🌐 **Dual ESM/CJS**: Supports both module formats
- 🔄 **Dataset Maintenance**: Reviewable updates from Garda Informatica
- 🎯 **Form Helpers**: Deduplicated data perfect for dropdowns and forms
- 📮 **Postal Code APIs**: Get all CAP codes for any commune
- 🏷️ **Unique Communes**: No duplicates, perfect for UI components

## 📦 Installation

```bash
npm install @marlenesco/italian-cap-comuni-province@latest
# or
yarn add @marlenesco/italian-cap-comuni-province@latest
# or
pnpm add @marlenesco/italian-cap-comuni-province@latest
```

To retain existing import paths, install the fork under the original name with an
npm alias:

```bash
npm install italian-cap-comuni-province@npm:@marlenesco/italian-cap-comuni-province@latest
```

See [Releasing the scoped fork](docs/releasing.md) for the release policy and the
GitHub merge-to-npm workflow.

## Lightweight postal-code checks in the browser

Use the CAP-only entry point from the `latest` release:

```typescript
import { hasCAP } from '@marlenesco/italian-cap-comuni-province/cap';

hasCAP('00118'); // true
hasCAP('99999'); // false
hasCAP(' 00118 '); // true: surrounding whitespace is trimmed
hasCAP('118'); // false: leading zeros must be preserved
```

`hasCAP(cap: string): boolean` checks membership in a generated collection of
unique CAP strings. It imports no municipality, province, or region records and
does not initialize the full API's geographic indexes. The collection is rebuilt
from the same validated source data on every build, including dataset updates.
The entry point supports both ESM and CommonJS and includes TypeScript types.

This is **dataset membership**, not business coverage. Generic or historical CAPs
accepted by an application may be absent from the source dataset; for example,
`hasCAP('20100')` is false in the current snapshot. Applications must keep their
supported-CAP rules separate. The existing root `isValidCAP` function only checks
format and numeric range; its behavior is unchanged.

The root entry point eagerly loads all geographic records and constructs their
indexes, even with a named import such as `getComuniByCAP`. Tree-shaking does not
isolate its postal codes. Upgrade and explicitly import `/cap` to get the compact
check; an existing root import will retain its full cost. Use the full API on the
server or where the complete geographic data is actually needed.

`npm run test:package` measures isolated minified browser bundles from the installed
tarball, compares the root lookup with `/cap`, and enforces CAP bundle limits of
45,000 bytes minified and 14,000 bytes gzip. These are package-level measurements,
not the size of an application's complete Next.js bundle.

Measured on 2026-11-18 with the 4,671-CAP dataset (esbuild, browser target ES2020,
minification enabled, Node.js gzip defaults):

| Isolated membership check | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| Root `getComuniByCAP(cap).length > 0` | 1,500,685 | 315,265 |
| `/cap` `hasCAP(cap)` | 37,458 | 10,744 |

The CAP-only entry reduces this isolated gzip payload by **96.6%**. Exact bytes
can change with the dataset or build toolchain; the limits above are regression
budgets, not a claim about an application's final transfer size.

### Download size and HTTP compression

The 1.50 MB and 315.3 kB figures describe the **same full API bundle** before and
after gzip compression. A browser receives the smaller payload only when the
application's server or CDN negotiates compression and sends the JavaScript with
`Content-Encoding: gzip` (or uses Brotli). It then decompresses and executes the
full JavaScript. The npm library cannot configure the consuming application's
HTTP response headers or guarantee its final chunk transfer size.

For CAP membership, import `/cap` to reduce both the uncompressed code/data and
the compressed transfer. For the full API, configure compression on the host and
check the actual JavaScript response headers and transferred bytes in the browser
Network panel. A dynamic import can defer a full API download, but it does not
make that payload smaller.

## 🚀 Full geographic API quick start

```typescript
import {
  searchComuni,
  getComuniByCAP,
  isValidCAP,
} from '@marlenesco/italian-cap-comuni-province';

// Search municipalities by name
const results = searchComuni('Milano', { limit: 5 });
console.log(results[0]?.item.nome); // "Milano"

// Find municipalities by postal code
const comuni = getComuniByCAP('20121');
console.log(comuni[0]?.nome); // "Milano"

// Validate format and numeric range, not dataset membership
console.log(isValidCAP('20100')); // true
console.log(isValidCAP('99999')); // false
```

## 🔍 Advanced Search

```typescript
import {
  searchComuni,
  searchComuniWithFilters,
} from '@marlenesco/italian-cap-comuni-province';

// Search with options
const results = searchComuni('Rom', {
  exactMatch: false, // partial search (default)
  limit: 10, // max 10 results
  soloCapoluoghi: true, // only provincial capitals
});

// Search with geographical filters
const filteredResults = searchComuniWithFilters(
  'San',
  {
    regione: 'Lombardia',
    provincia: 'Milano',
  },
  { limit: 5 },
);
```

## 🏛️ Working with Provinces and Regions

```typescript
import {
  getAllProvince,
  getComuniByProvincia,
  getComuniByRegione,
  getCapoluoghi,
  getProvinceByRegione,
  getComuniUniqueByProvincia,
  getCapsByComune,
  getCapsByComuneNome,
} from '@marlenesco/italian-cap-comuni-province';

// Get all provinces (alphabetically sorted)
const province = getAllProvince();

// Municipalities by province
const comuniMilano = getComuniByProvincia('Milano'); // or 'MI'

// Municipalities by region
const comuniLombardia = getComuniByRegione('Lombardia');

// Get provinces in a region (alphabetically sorted)
const provinceLombardia = getProvinceByRegione('Lombardia');

// Only provincial capitals
const capoluoghi = getCapoluoghi();

// Get unique communes for forms (no CAP duplicates)
const uniqueComuni = getComuniUniqueByProvincia('Milano'); // or 'MI'

// Get all postal codes for a commune
const caps = getCapsByComune('015146'); // ISTAT code

// Handle communes with same name in different provinces
const results = getCapsByComuneNome('San Giovanni');
```

## 🏗️ Form Integration & UI Helpers

### Deduplicated Data for Forms

When building forms, you often need unique communes without CAP duplicates. These helper functions provide clean data for dropdowns and selects:

```typescript
import {
  getComuniUniqueByProvincia,
  getCapsByComune,
  getCapsByComuneNome,
  getComuneWithAllCaps,
} from '@marlenesco/italian-cap-comuni-province';

// Get unique communes for a province (no CAP duplicates)
const uniqueComuni = getComuniUniqueByProvincia('MI');
console.log(uniqueComuni.length); // No duplicates, perfect for dropdowns

// Get all postal codes for a specific commune
const caps = getCapsByComune('015146'); // Milano ISTAT code
console.log(caps); // ['20100', '20121', '20122', ...] - all Milan postal codes

// Get postal codes by commune name (handles homonyms)
const results = getCapsByComuneNome('San Giovanni');
results.forEach((result) => {
  console.log(
    `${result.comune.nome} (${
      result.comune.siglaProvincia
    }): ${result.caps.join(', ')}`,
  );
});

// Get complete commune data with all its postal codes
const communeData = getComuneWithAllCaps('015146');
if (communeData) {
  console.log(
    `${communeData.comune.nome} has ${communeData.caps.length} postal codes`,
  );
}
```

### Complete React Form Example

```typescript
import React, { useState, useEffect } from 'react';
import {
  getAllProvince,
  getComuniUniqueByProvincia,
  getCapsByComune,
  type Comune,
} from '@marlenesco/italian-cap-comuni-province';

function AddressForm() {
  const [selectedProvincia, setSelectedProvincia] = useState('');
  const [selectedComune, setSelectedComune] = useState<Comune | null>(null);
  const [availableCAPs, setAvailableCAPs] = useState<string[]>([]);

  // Load provinces
  const province = getAllProvince();

  // Load unique communes when province changes
  const comuni = selectedProvincia
    ? getComuniUniqueByProvincia(selectedProvincia)
    : [];

  // Load postal codes when commune changes
  useEffect(() => {
    if (selectedComune) {
      const caps = getCapsByComune(selectedComune.codiceIstat);
      setAvailableCAPs(caps);
    } else {
      setAvailableCAPs([]);
    }
  }, [selectedComune]);

  return (
    <form>
      {/* Province Dropdown */}
      <select
        value={selectedProvincia}
        onChange={(e) => setSelectedProvincia(e.target.value)}
      >
        <option value="">Select Province</option>
        {province.map((provincia) => (
          <option key={provincia.sigla} value={provincia.sigla}>
            {provincia.nome}
          </option>
        ))}
      </select>

      {/* Communes Dropdown (no duplicates!) */}
      <select
        value={selectedComune?.codiceIstat || ''}
        onChange={(e) => {
          const comune = comuni.find((c) => c.codiceIstat === e.target.value);
          setSelectedComune(comune || null);
        }}
        disabled={!selectedProvincia}
      >
        <option value="">Select Commune</option>
        {comuni.map((comune) => (
          <option key={comune.codiceIstat} value={comune.codiceIstat}>
            {comune.nome}
          </option>
        ))}
      </select>

      {/* Postal Codes Dropdown */}
      <select disabled={!selectedComune}>
        <option value="">Select Postal Code</option>
        {availableCAPs.map((cap) => (
          <option key={cap} value={cap}>
            {cap}
          </option>
        ))}
      </select>
    </form>
  );
}
```

## 🔮 Autocomplete

```typescript
import { getSuggestions } from '@marlenesco/italian-cap-comuni-province';

// For implementing autocomplete
const suggestions = getSuggestions('Mil', 5);
// ['Milano', 'Milazzo', 'Militello in Val di Catania', ...]
```

## 📊 Data Access

```typescript
import comuniItaliani from '@marlenesco/italian-cap-comuni-province';

// Complete data access
const stats = comuniItaliani.getStats();
console.log(`Total municipalities: ${stats.totaleComuni}`);

// Single municipality by ISTAT code
const roma = comuniItaliani.getComuneByIstat('058091');

// All regions (alphabetically sorted)
const regioni = comuniItaliani.getAllRegioni();
```

## 🏗️ Form Integration Example

```typescript
import {
  searchComuni,
  isValidCAP,
  getSuggestions,
} from '@marlenesco/italian-cap-comuni-province';

// React component example
function CityAutocomplete({ value, onChange }) {
  const [suggestions, setSuggestions] = useState([]);

  const handleInputChange = (query) => {
    const results = getSuggestions(query, 10);
    setSuggestions(results);
  };

  const handleCitySelect = (cityName) => {
    const results = searchComuni(cityName, { exactMatch: true });
    if (results.length > 0) {
      const comune = results[0].item;
      onChange({
        comune: comune.nome,
        provincia: comune.nomeProvincia,
        cap: comune.cap,
        regione: comune.nomeRegione,
      });
    }
  };

  // ... rest of component
}
```

## 📋 TypeScript Types

```typescript
interface Regione {
  codiceRegione: string;
  nome: string;
  tipologia: string;
  ripartizioneGeografica: string;
  numeroProvince: number;
  numeroComuni: number;
  superficie: number; // in km²
}

interface Provincia {
  codiceRegione: string;
  sigla: string;
  nome: string;
  tipologia: string;
  numeroComuni: number;
  superficie: number; // in km²
  codiceSovracomunale: string;
}

interface Comune {
  codiceIstat: string;
  nome: string;
  nomeAlternativo?: string;
  cap: string;
  codiceBelfiore: string;
  siglaProvincia: string;
  nomeProvincia: string;
  codiceRegione: string;
  nomeRegione: string;
  tipologiaRegione: string;
  ripartizioneGeografica: string;
  isCapoluogo: boolean;
  coordinate: {
    lat: number;
    lng: number;
  };
  superficie: number;
}

interface SearchOptions {
  caseSensitive?: boolean;
  exactMatch?: boolean;
  limit?: number;
  soloCapoluoghi?: boolean;
}

interface SearchResult<T> {
  item: T;
  score: number;
}

interface ComuneWithCaps {
  comune: Comune;
  caps: string[];
}
```

### How to use all interfaces:

```typescript
// Working with the complete hierarchy
const regione: Regione = getAllRegioni()[0];
const province: Provincia[] = getProvinceByRegione(regione.nome);
const comuni: Comune[] = getComuniByProvincia(province[0].sigla);

console.log(
  `${regione.nome} has ${regione.numeroProvince} provinces and ${regione.numeroComuni} municipalities`,
);

const regionePuglia: Regione = getRegioneByCode('16');
const provincePuglia: Provincia[] = getProvinceByCodeRegione(
  regionePuglia.codiceRegione,
);

console.log(`${regionePuglia.nome} has ${regionePuglia.numeroProvince}`);
```

## 📖 API Reference

### Core Search Functions

```typescript
searchComuni(query, options); // Search municipalities with scoring
searchProvince(query, options); // Search provinces
searchRegioni(query, options); // Search regions
searchComuniWithFilters(query, filters, options); // Advanced filtered search
```

### Data Access Functions

```typescript
getAllRegioni(); // Get all regions (sorted)
getAllProvince(); // Get all provinces (sorted)
getComuniByProvincia(provincia); // Get all municipalities (with duplicates)
getComuniByRegione(regione); // Get municipalities by region
getCapoluoghi(); // Get only provincial capitals
```

### Form Helper Functions ⭐ New

```typescript
getComuniUniqueByProvincia(provincia); // Unique municipalities for dropdowns
getCapsByComune(codiceIstat); // All postal codes for a municipality
getCapsByComuneNome(nome); // Postal codes by municipality name
getComuneWithAllCaps(codiceIstat); // Complete municipality data with all CAPs
```

### Utility Functions

```typescript
isValidCAP(cap); // Validate Italian postal codes
getSuggestions(query, limit); // Get autocomplete suggestions
```

## ⚡ Performance

- **Runtime data**: Shared tabular JSON assets, generated from the original datasets during build
- **Search speed**: O(1) for CAP and ISTAT codes, O(n) optimized for names
- **Benchmarks**: [Measured before/after results, methodology and limitations](docs/benchmarks.md).
  Reproduce measurements with `node scripts/benchmark.mjs` (see [dataset maintenance](docs/datasets.md)).
- **Browser imports**: Use `/cap` for compact membership checks. Named imports from
  the root entry point retain the full datasets and eager geographic indexes.

## 📊 Data Source

This library uses the comprehensive Italian municipalities database provided by **[Garda Informatica](https://www.gardainformatica.it/database-comuni-italiani)**.

The database includes:

- **8,000+** Italian municipalities
- **110+** provinces and metropolitan cities
- **20** regions
- Postal codes (CAP)
- ISTAT codes
- Geographic coordinates
- Administrative boundaries

**Data Features:**

- ✅ **Reviewable Updates**: Explicit source updates with validation and provenance
- ✅ **Complete**: All Italian administrative divisions
- ✅ **Free**: Released under MIT license
- ✅ **Reliable**: Used by professionals and developers

## 🙏 Credits

Special thanks to **[Garda Informatica](https://www.gardainformatica.it/)** for providing and maintaining this comprehensive, free, and always up-to-date database of Italian municipalities. Their automated procedures ensure the data stays current with official ISTAT sources.

Visit their website: [https://www.gardainformatica.it/database-comuni-italiani](https://www.gardainformatica.it/database-comuni-italiani)

## 🔄 Data Updates

The original Garda Informatica JSON files in `src/data` are the source of truth.
Builds generate lossless tabular runtime assets locally; builds, tests and installs
never download datasets.

```bash
npm run data:check                    # Compare the latest official archive without writing
npm run data:update -- --dry-run      # Preview changes
npm run data:update                   # Validate and update the original JSON files
npm run data:verify                   # Verify local data and checksums offline
npm run data:build                    # Regenerate runtime tables offline
```

See [Dataset maintenance](docs/datasets.md) for local ZIP import, change reports,
the opt-in weekly GitHub update proposals, provenance and rollback. Maintainers
review updates before merging. The fork can publish new versions after merge
through the [opt-in release workflow](docs/releasing.md).

## 📄 License

MIT License - see [LICENSE](LICENSE) file

Original database by Garda Informatica is also released under MIT License.

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for build, test and dataset maintenance instructions.

## 🔗 Links

- [Repository](https://github.com/marlenesco/italian-cap-comuni-province)
- [Upstream repository](https://github.com/spritzcoder/italian-cap-comuni-province)
- [NPM Package](https://www.npmjs.com/package/@marlenesco/italian-cap-comuni-province)
- [Data Source](https://www.gardainformatica.it/database-comuni-italiani)
- [Issues](https://github.com/marlenesco/italian-cap-comuni-province/issues)

---

Made with ❤️ for the Italian developer community
