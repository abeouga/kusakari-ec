package jp.kusakari.ec.catalog.dto;

// Image references remain readable for saved gardens after a product leaves the sales catalog.
public record ProductImageReference(String id, String name, String imageUrl, boolean active, boolean hasPlantModel) {}
