window.onload = async () => {
  // Variables
  let franceCenter = [46.603354, 1.888334];
  const franceMetroExtremities = {
    latMin: 41.3,
    latMax: 51.1,
    lngMin: -5.1,
    lngMax: 9.6,
  };
  let globalYearStart = document.querySelector(".year-range-min").value;
  let globalYearEnd = document.querySelector(".year-range-max").value;
  // Poids pour la heatmap
  const floodWeight = 0.00001;
  const fireWeight = 4;
  const earthquakeWeight = 0.7;

  // Fonctions utilitaires
  function createEarthquakeLayer(data, startYear, endYear) {
    return L.geoJSON(data, {
      filter: (feature) => {
        return (
          feature.properties.Time <= `${endYear}-01-01T00:00:00Z` &&
          feature.properties.Time >= `${startYear}-01-01T00:00:00Z` &&
          feature.properties.Magnitude >= 3
        );
      },
      pointToLayer: (feature, latlng) => {
        let magnitude = feature.properties.Magnitude;
        let radius = 3000 * Math.pow(2, magnitude - 3);
        let color = `hsl(${120 - magnitude * 20}, 100%, 50%)`;
        let circle = L.circle(latlng, {
          radius: radius,
          color: color,
          weight: 0,
          fillColor: color,
          fillOpacity: 0.7,
        });
        return circle;
      },
      onEachFeature: (feature, layer) => {
        let date = new Date(feature.properties.Time);
        date = date.toLocaleDateString("fr-FR");
        let popupContent = `<h2>${feature.properties.Magnitude}</h2>`;
        popupContent += `<p>${date}</p>`;
        layer.bindPopup(popupContent);
      },
    });
  }

  function createLayerFlood(data, startYear, endYear, minDateFlood) {
    return L.geoJSON(data, {
      filter: (feature) => {
        let year = new Date(feature.properties.DhCEntCru).getFullYear();
        return (
          year > startYear && year < endYear && feature.properties.id > 500
        );
      },
      onEachFeature: (feature, layer) => {
        let date = new Date(feature.properties.DhCEntCru);
        let opacity =
          (0.5 * (date - minDateFlood)) / (Date.now() - minDateFlood);
        layer.setStyle({
          color: "#1a1ac9",
          weight: 1.4,
          opacity: opacity,
        });
      },
    });
  }

  function createLayerFire(data, startYear, endYear) {
    return L.geoJSON(data, {
      filter: (feature) => {
        return (
          feature.properties.year >= startYear &&
          feature.properties.year <= endYear
        );
      },
      pointToLayer: (feature, latlng) => {
        let size = Math.sqrt(feature.properties.covered_surface) / 20;
        const minSize = 40; 
        const maxSize = 400;
        let normalizedSize = (size - minSize) / (maxSize - minSize);
        normalizedSize = Math.max(0, Math.min(normalizedSize, 1));
        let r = Math.round(225 - normalizedSize * (225 - 75));
        let g = Math.round(38 - normalizedSize * (38 - 14));
        let b = Math.round(38 - normalizedSize * (38 - 14));
        let color = `rgb(${r}, ${g}, ${b})`;
        let triangle = L.polygon(
          [
            [latlng.lat, latlng.lng],
            [latlng.lat - size / 1000, latlng.lng - size / 2000],
            [latlng.lat - size / 1000, latlng.lng + size / 2000],
          ],
          {
            color: color,
            weight: 1,
            fillColor: color,
            fillOpacity: 0.8,
          }
        );
        return triangle;
      },
      onEachFeature: (feature, layer) => {
        let commune = feature.properties.commune_name;
        let popupContent = `<h2>fire</h2>`;
        popupContent += `<p>${commune}</p>`;
        if (feature.properties.covered_surface) {
          let surface = feature.properties.covered_surface;
          surface = surface / 10000;
          popupContent += `<p>${surface} ha</p>`;
        }
        layer.bindPopup(popupContent);
      },
    });
  }

  let debounceTimer;

  function debounce(callback, delay) {
    return function (...args) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => callback(...args), delay);
    };
  }

  function getOldest(data, property) {
    let minDate = new Date(data.features[0].properties[property]);
    for (let feature of data.features) {
      let date = new Date(feature.properties[property]);
      if (date < minDate) {
        minDate = date;
      }
    }
    return minDate;
  }

  function extractPointsFromGeometry(geometry, weight = 1) {
    let points = [];
    if (geometry.type === "MultiLineString") {
      geometry.coordinates.forEach((line) => {
        line.forEach((coord) => {
          points.push([coord[1], coord[0], weight]);
        });
      });
    }
    return points;
  }

  function extractHeatData(data, startYear, endYear) {
    let heatData = [];

    data.forEach((dataset) => {
      dataset.features.forEach((feature) => {
        let geometry = feature.geometry;
        // Poids tremblement de terre par défaut
        let weight = earthquakeWeight;

        if (geometry.type === "MultiLineString") {
          let year = new Date(feature.properties.DhCEntCru).getFullYear();
          if (year >= startYear && year <= endYear) {
            weight = floodWeight;
            heatData.push(...extractPointsFromGeometry(geometry, weight));
          }
        } else if (geometry.type === "Point") {
          let lat = geometry.coordinates[1];
          let lng = geometry.coordinates[0];
          let year;
          // Si c'est un incendie
          if (feature.properties.covered_surface) {
            year = feature.properties.year;
            if (year >= startYear && year <= endYear) {
              weight = fireWeight;
              heatData.push([lat, lng, weight]);
            }
          } else {
            if (
              feature.properties.Time <= `${endYear}-01-01T00:00:00Z` &&
              feature.properties.Time >= `${startYear}-01-01T00:00:00Z`
            ) {
              heatData.push([lat, lng, weight]);
            }
          }
        }
      });
    });

    return heatData;
  }

  function createHeatmapLayer(heatData) {
    // Création de la couche heatmap
    let heatLayer = L.heatLayer(heatData, {
      radius: 25,
      blur: 15,
      maxZoom: 10,
      max: 10,
    });
    return heatLayer;
  }

  function updateLayersByYear() {
    globalYearStart = parseInt(rangeMin.value);
    globalYearEnd = parseInt(rangeMax.value);

    disasterCheckboxes.forEach((checkbox) => {
      let layer = layersMap[checkbox.id];
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });

    layersMap = {
      earthquake: createEarthquakeLayer(
        earthquakeData,
        globalYearStart,
        globalYearEnd
      ),
      flood: createLayerFlood(
        floodData,
        globalYearStart,
        globalYearEnd,
        minDateFlood
      ),
      fire: createLayerFire(fireData, globalYearStart, globalYearEnd),
    };

    disasterCheckboxes.forEach((checkbox) => {
      let layer = layersMap[checkbox.id];
      if (checkbox.checked) {
        map.addLayer(layer);
      }
    });

    updateHeatMapLayer();
  }

  function updateHeatMapLayer() {
    let hadHeatmapLayer = map.hasLayer(heatmapLayer);
    map.removeLayer(heatmapLayer);
    let localHeatData = [];
    disasterCheckboxes.forEach((checkbox) => {
      if (checkbox.checked) {
        localHeatData.push(dataMap[checkbox.id]);
      }
    });
    console.log(localHeatData);
    heatData = extractHeatData(localHeatData, globalYearStart, globalYearEnd);
    heatmapLayer = createHeatmapLayer(heatData);
    if (hadHeatmapLayer) {
      map.addLayer(heatmapLayer);
    }
  }

  // Fonctions pour la grille
  function createGridWithinBorders(
    borders,
    cellSize,
    center = null,
    radius = 0
  ) {
    let grid = [];
    let franceLayer = L.geoJSON(borders); // Charger les frontières de la France
    let francePolygon = franceLayer.getLayers()[0].toGeoJSON(); // Obtenir le polygone de la France

    // Initialiser le cercle uniquement si center et radius sont définis
    let circle = null;
    if (center && radius > 0) {
      circle = turf.circle([center.lng, center.lat], radius, {
        steps: 64,
        units: "kilometers",
      });
    }

    // Limites géographiques de la France
    const latMin = franceMetroExtremities.latMin;
    const latMax = franceMetroExtremities.latMax;
    const lngMin = franceMetroExtremities.lngMin;
    const lngMax = franceMetroExtremities.lngMax;

    for (let lat = latMin; lat < latMax; lat += cellSize) {
      for (let lng = lngMin; lng < lngMax; lng += cellSize) {
        const cell = turf.polygon([
          [
            [lng, lat],
            [lng + cellSize, lat],
            [lng + cellSize, lat + cellSize],
            [lng, lat + cellSize],
            [lng, lat],
          ],
        ]);

        // Vérifie si la cellule chevauche ou intersecte les frontières de la France
        const inFrance = turf.booleanIntersects(cell, francePolygon);

        // Vérifie si la cellule est dans le cercle, si le cercle existe
        const inCircle = circle ? turf.booleanIntersects(cell, circle) : true;

        // Ajouter la cellule uniquement si elle est valide selon les deux conditions
        if (inFrance && inCircle) {
          const leafletCell = L.polygon([
            [lat, lng],
            [lat + cellSize, lng],
            [lat + cellSize, lng + cellSize],
            [lat, lng + cellSize],
          ]);

          grid.push({
            bounds: leafletCell.getBounds(),
            count: 0,
          });
        }
      }
    }
    return grid;
  }

  // Compter les points dans chaque case de la grille
  function countPointsInGrid(grid, data) {
    data.forEach((point) => {
      const [lat, lng] = point;
      grid.forEach((cell) => {
        const bounds = cell.bounds;
        const southWest = bounds.getSouthWest();
        const northEast = bounds.getNorthEast();
        if (
          lat >= southWest.lat &&
          lat <= northEast.lat &&
          lng >= southWest.lng &&
          lng <= northEast.lng
        ) {
          cell.count++;
        }
      });
    });
    return grid;
  }

  // Trouver la ou les cases avec le moins de points (les si plus d'une case)
  function findSafestCell(grid) {
    let safestCells = [];
    let minCount = grid[0].count;
    grid.forEach((cell) => {
      if (cell.count < minCount) {
        minCount = cell.count;
        safestCells = [cell];
      } else if (cell.count === minCount) {
        safestCells.push(cell);
      }
    });
    return safestCells;
  }

  function findNearestSafestCell(center, safestCells) {
    let nearestSafestCell = null;
    let minDistance = Infinity;

    safestCells.forEach((cell) => {
      const cellCenter = cell.bounds.getCenter();
      const distance = turf.distance(
        [center.lng, center.lat],
        [cellCenter.lng, cellCenter.lat],
        { units: "kilometers" }
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearestSafestCell = cell;
      }
    });

    return nearestSafestCell;
  }

  // Récupération des données
  let [earthquakeData, floodData, fireData, franceBorders] = await Promise.all([
    fetch("/data/dataset_seismes.json").then((res) => res.json()),
    fetch("/data/dataset_innondations.json").then((res) => res.json()),
    fetch("/data/dataset_incendies.geojson").then((res) => res.json()),
    fetch("/data/france_borders.geojson").then((res) => res.json()),
  ]);

  // Création des couches géographiques
  let minDateFlood = getOldest(floodData, "DhCEntCru");
  let layersMap = {
    earthquake: createEarthquakeLayer(
      earthquakeData,
      globalYearStart,
      globalYearEnd
    ),
    flood: createLayerFlood(
      floodData,
      globalYearStart,
      globalYearEnd,
      minDateFlood
    ),
    fire: createLayerFire(fireData, globalYearStart, globalYearEnd),
  };
  let dataMap = {
    earthquake: earthquakeData,
    flood: floodData,
    fire: fireData,
  };

  // Initialisation de la carte Leaflet
  let map = L.map("map").setView(franceCenter, 6);
  let darkModeUrl =
    "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png";
  let lightModeUrl =
    "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png";

  let baseLayer = L.tileLayer(darkModeUrl, {
    maxZoom: 20,
    attribution:
      '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
  baseLayer.addTo(map);

  // Initialisation de la heatmap
  let heatData = extractHeatData(
    [fireData, floodData, earthquakeData],
    globalYearStart,
    globalYearEnd
  );
  let heatmapLayer = createHeatmapLayer(heatData);
  const heatmapButton = document.getElementById("heatmapButton");
  heatmapButton.addEventListener("click", () => {
    if (map.hasLayer(heatmapLayer)) {
      map.removeLayer(heatmapLayer);
    } else {
      map.addLayer(heatmapLayer);
    }
  });

  // Dark Mode
  let darkModeButton = document.getElementById("darkModeButton");
  let isDarkMode = true;
  let darkModeIcon = document.getElementById("darkModeIcon");
  let lightModeIcon = document.getElementById("lightModeIcon");

  function applyTheme() {
    const html = document.documentElement;
    if (isDarkMode) {
      html.setAttribute("data-theme", "dark");
      baseLayer.setUrl(darkModeUrl);
      darkModeIcon.style.display = "block";
      lightModeIcon.style.display = "none";
    } else {
      html.setAttribute("data-theme", "light");
      baseLayer.setUrl(lightModeUrl);
      darkModeIcon.style.display = "none";
      lightModeIcon.style.display = "block";
    }
  }
  applyTheme();
  darkModeButton.addEventListener("click", () => {
    isDarkMode = !isDarkMode;
    applyTheme();
  });

  // filters
  const bumpFilters = document.getElementById("bump-filters");
  const filters = document.getElementById("filters");

  let filtersVisibles = false;

  bumpFilters.addEventListener("click", () => {
    filtersVisibles = !filtersVisibles;
    if (filtersVisibles) {
      filters.classList.add("visible");
      bumpFilters.classList.add("visible");
    } else {
      filters.classList.remove("visible");
      bumpFilters.classList.remove("visible");
    }
  });

  // Gestion des checkboxs
  const disasterCheckboxes = document.querySelectorAll(".catastrophe input");
  disasterCheckboxes.forEach((checkbox) => {
    checkbox.checked = true;
    let layer = layersMap[checkbox.id];
    map.addLayer(layer);
    checkbox.addEventListener("change", () => {
      layer = layersMap[checkbox.id];
      if (checkbox.checked) {
        map.addLayer(layer);
      } else {
        map.removeLayer(layer);
      }
      updateHeatMapLayer();
    });
  });

  // Barre d'année
  const rangeMin = document.querySelector(".year-range-min");
  const rangeMax = document.querySelector(".year-range-max");
  const rangeSelected = document.querySelector(".range-selected");
  const spanMin = document.querySelector(".span-year-min");
  const spanMax = document.querySelector(".span-year-max");

  function updateSlider() {
    const minVal = parseInt(rangeMin.value);
    const maxVal = parseInt(rangeMax.value);
    const range = rangeMax.max - rangeMin.min;

    const percentMin = ((minVal - rangeMin.min) / range) * 100;
    const percentMax = ((maxVal - rangeMin.min) / range) * 100;

    rangeSelected.style.background = `linear-gradient(to right, var(--text-color) ${percentMin}%, var(--second-color) ${percentMin}%, var(--second-color) ${percentMax}%, var(--text-color) ${percentMax}%)`;

    spanMin.textContent = minVal;
    spanMax.textContent = maxVal;
  }

  // Empêche que les thumbs se croisent
  rangeMin.addEventListener("input", () => {
    if (parseInt(rangeMin.value) > parseInt(rangeMax.value) - 1) {
      rangeMin.value = parseInt(rangeMax.value) - 1;
    }
    updateSlider();
  });

  rangeMax.addEventListener("input", () => {
    if (parseInt(rangeMax.value) < parseInt(rangeMin.value) + 1) {
      rangeMax.value = parseInt(rangeMin.value) + 1;
    }
    updateSlider();
  });

  updateSlider();

  // Lier la mise à jour des couches aux événements des sliders
  rangeMin.addEventListener("input", debounce(updateLayersByYear, 200));
  rangeMax.addEventListener("input", debounce(updateLayersByYear, 200));

  // Localisation personnelle
  let locationInput = document.getElementById("location-input");
  const dataList = document.getElementById("citySuggestions");
  // Regex pour une ville
  const frenchCityRegex = /^[A-Za-zÀ-ÿ' -]+(?: [A-Za-zÀ-ÿ' -]+)*$/;
  // Regex pour un couple (latitude, longitude)
  const latLongRegex = /^\((-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)\)$/;
  let currentMarker = null;
  // Bouton pour trouver l'emplacement le plus sûr
  let safestButton = document.getElementById("safestButton");
  let currentCircle = null;
  let currentPoint = null;
  let currentItinerary = null;

  function addMarker(coordinates, popupText = "Votre localisation") {
    [currentMarker, currentCircle, currentPoint, currentItinerary].forEach(
      (layer) => {
        if (layer) {
          map.removeLayer(layer);
        }
      }
    );
    currentMarker = L.marker(coordinates).bindPopup(popupText);
    currentMarker.addTo(map);
    map.setView(coordinates, 10);
  }

  // Fonction pour rechercher une ville
  async function searchCity(city) {
    try {
      const response = await fetch(
        `https://geo.api.gouv.fr/communes?nom=${city}&boost=population&fields=centre,code&format=json&geometry=centre`
      );
      const data = await response.json();
      dataList.innerHTML = "";
      if (data.length === 1) {
        const coordinates = data[0].centre.coordinates.reverse();
        addMarker(coordinates);
        safestButton.disabled = false;
      } else if (data.length > 1) {
        data.forEach((cityData) => {
          const cityName = cityData.nom;
          const postalCode = cityData.code;
          const coordinates = cityData.centre.coordinates.reverse();
          const option = document.createElement("option");
          option.value = `${cityName} (${postalCode})`;
          option.dataset.lat = coordinates[0];
          option.dataset.lng = coordinates[1];
          dataList.appendChild(option);
        });
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des données :", error);
    }
  }

  // Gérer la saisie dans l'input
  locationInput.addEventListener("input", (e) => {
    const inputValue = e.target.value.trim();
    const selectedOption = Array.from(dataList.options).find(
      (option) => option.value === inputValue
    );

    if (selectedOption) {
      const coordinates = [
        parseFloat(selectedOption.dataset.lat),
        parseFloat(selectedOption.dataset.lng),
      ];
      addMarker(coordinates);
      dataList.innerHTML = "";
      safestButton.disabled = false;
    }
  });

  // Gérer l'appui sur la touche Entrée
  locationInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const inputValue = locationInput.value.trim();

      if (frenchCityRegex.test(inputValue)) {
        searchCity(inputValue);
      } else if (latLongRegex.test(inputValue)) {
        const match = inputValue.match(latLongRegex);
        const coordinates = [parseFloat(match[1]), parseFloat(match[3])];
        addMarker(coordinates);
        dataList.innerHTML = "";
        safestButton.disabled = false;
      } else {
        console.log("L'entrée est invalide :", inputValue);
      }
    }
  });

  // Listener pour le bouton "Trouver la zone la plus sûre"
  safestButton.addEventListener("click", () => {
    console.log("click entendu");
    const cellSize = 0.2;
    const center = currentMarker.getLatLng();
    const radius = 100;

    // Créer une grille autour de Paris avec un rayon de 50 km
    const grid = createGridWithinBorders(
      franceBorders,
      cellSize,
      center,
      radius
    );

    currentCircle = L.circle([center.lat, center.lng], {
      radius: radius * 1000,
      color: "red",
    });
    currentCircle.addTo(map);

    const allData = extractHeatData(
      [fireData, earthquakeData],
      globalYearStart,
      globalYearEnd
    );
    const updatedGrid = countPointsInGrid(grid, allData);
    const safestCells = findSafestCell(updatedGrid);
    const safestCell = findNearestSafestCell(center, safestCells);
    const safestCenter = safestCell.bounds.getCenter();
    currentPoint = L.circle([safestCenter.lat, safestCenter.lng], {
      radius: cellSize * 1000,
      color: "green",
    });
    currentPoint.addTo(map);
    currentItinerary = L.polyline(
      [
        [center.lat, center.lng],
        [safestCenter.lat, safestCenter.lng],
      ],
      {
        color: "green",
      }
    );
    currentItinerary.addTo(map);
  });

  // Légendes
  const legends = document.querySelectorAll(".legend");
  const selectors = document.querySelectorAll(".legend-selector");

  let currentLegendIndex = 0;
  let intervalId;

  function showLegend(index) {
    legends.forEach((legend, i) => {
      legend.style.display = i === index ? "flex" : "none";
      selectors[i].classList.toggle("active", i === index);
    });
    currentLegendIndex = index;
  }

  function startAutoChange() {
    intervalId = setInterval(() => {
      const nextIndex = (currentLegendIndex + 1) % legends.length;
      showLegend(nextIndex);
    }, 5000);
  }

  selectors.forEach((selector, index) => {
    selector.addEventListener("click", () => {
      clearInterval(intervalId);
      showLegend(index);
      startAutoChange();
    });
  });

  showLegend(currentLegendIndex);
  // startAutoChange();
};
