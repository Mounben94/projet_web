const inputFile = "./dataset_incendies.json";
const outputFile = "./data/dataset_incendies_test.geojson";

(async function convertToGeoJSON() {
  try {
    const response = await fetch(inputFile);

    if (!response.ok) {
      throw new Error(`Error while reading the JSON file : ${response.statusText}`);
    }

    const jsonData = await response.json();

    if (!Array.isArray(jsonData)) {
      throw new Error("Can't be converted to GeoJSON : not an array");
    }

    const geojson_output = {
      type: "FeatureCollection",
      features: jsonData.map(item => ({
        type: "Feature",
        properties: Object.fromEntries(
          Object.entries(item).filter(([key]) => key !== "coordinates")
        ),
        geometry: item.coordinates
      }))
    };

    const geojsonString = JSON.stringify(geojson_output, null, 2);
    const blob = new Blob([geojsonString], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = outputFile;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

  } catch (error) {
    console.error("Error :", error.message);
  }
})();
