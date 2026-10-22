const axios = require("axios");

async function getVehicle(vehicleId, authorization) {
  const response = await axios.get(
    `${process.env.VEHICLE_SERVICE_URL}/vehicles`,
    {
      params: { id: vehicleId },
      headers: {
        Authorization: authorization
      },
      timeout: 5000
    }
  );

  const vehicle = response.data[0];

  if (!vehicle) {
    const error = new Error("Vehicle not found");
    error.status = 404;
    throw error;
  }

  return vehicle;
}

module.exports = { getVehicle };