/** Retain only catalog fields, never arbitrary provider response properties. */
const fields = new Set(`general_information product_info is_customizable is_size_customizable delivery_estimate_days delivery_info supports_free_assembly estimated_delivery free_delivery free_assembly is_assemble description primary_images variant_images additional_images image responsive_images url fabric_color_info color_name color_hex fabric_name stock_status status stock_count message view_count average_rating labels name variants fabricsList colorsList hex info_image stock variant_image info_section material dimensions specs warranty assembly care label value region_prices total_price variant_price price selling_price sale_price offer_price final_price discounted_price current_price unit_price amount total_base_price base_price list_price original_price mrp strike_price compare_at_price regular_price was_price max_price ae uae`.split(' '));
export function filterProductResponse(input: unknown, parent = '', depth = 0): unknown {
  if (depth > 15) return undefined;
  if (Array.isArray(input)) return input.slice(0, 500).map((item) => filterProductResponse(item, parent, depth + 1));
  if (input && typeof input === 'object') {
    return Object.fromEntries(Object.entries(input).filter(([key]) => fields.has(key) || (parent === 'responsive_images' && /^(?:\d+|small|medium|large|original|thumbnail)$/.test(key))).map(([key, value]) => [key, filterProductResponse(value, key, depth + 1)]));
  }
  return typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean' ? input : undefined;
}
