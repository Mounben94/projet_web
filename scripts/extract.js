async function convertToGeoJSON() {
  const csvFilePath = '../data/dataset_incendies.csv';
  const inseeFilePath = '../data/dataset_insee.json';

    // Fetch and parse INSEE data
    const inseeResponse = await fetch(inseeFilePath);
    const inseeData = await inseeResponse.json();
    console.log(inseeData);
    const inseeDict = inseeData.reduce((dict, item) => {
      const inseeCode = String(item.code_commune_insee || '').padStart(5, '0');
      const geopoint = item._geopoint || "0.0,0.0";
      if (inseeCode && geopoint) {
        dict[inseeCode] = geopoint;
      }
      return dict;
    }, {});

    // Fetch and parse CSV data
    const csvResponse = await fetch(csvFilePath);
    const csvData = await csvResponse.text();
    const results = Papa.parse(csvData, {
      header: true,
      delimiter: ';',
      dynamicTyping: true,
      skipEmptyLines: true
    });

    // Generate GeoJSON features
    const features = results.data.map(row => {
      const inseeCode = String(row.insee_code || '0').padStart(5, '0');
      const geopoint = inseeDict[inseeCode] || "0.0,0.0";
      const [latitude, longitude] = geopoint.split(',').map(parseFloat);

      return {
        type: 'Feature',
        properties: {
          year: row.year || 0,
          num: row.num || 0,
          dept: row.dept || 0,
          insee_code: inseeCode,
          commune_name: row.commune_name,
          date_alerte: row.date_alerte || 0,
          covered_surface: row.covered_surface || 0,
          forest_surface: row.forest_surface || 0,
          reason: row.reason || 0,
          temperature: row.temperature || 0,
          hygrometry: row.hygrometry || 0,
          average_wind_speed: row.average_wind_speed || 0,
          wind_direction: row.wind_direction || 0
        },
        geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        }
      };
    });

    const geojson = {
      type: "FeatureCollection",
      features
    };

    // Trigger the download of the GeoJSON file
    const geojsonBlob = new Blob([JSON.stringify(geojson, null, 4)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(geojsonBlob);
    link.download = 'output.geojson';
    // link.click();
}

document.addEventListener("DOMContentLoaded", convertToGeoJSON);