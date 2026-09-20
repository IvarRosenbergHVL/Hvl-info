#pragma once
// Copy to BackendConfig.h (gitignored). HTTPS is REQUIRED.
// Use the trusted root CA PEM for the actual HVL Info API endpoint;
// never setInsecure() or send provisioning keys to an HTTP URL.
// Example: https://info-api.example.hvl.no (no trailing slash)
static const char HVL_API_BASE_URL[] = "https://REPLACE-WITH-APPROVED-HVL-API";
static const char HVL_ROOT_CA_PEM[] = R"PEM(
-----BEGIN CERTIFICATE-----
PASTE-APPROVED-ROOT-CA-PEM-HERE
-----END CERTIFICATE-----
)PEM";
