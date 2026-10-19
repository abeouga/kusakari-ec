package jp.kusakari.ec.catalog.dto;

import java.util.List;

public record PlantSuggestionView(PlantModelProfile profile, List<String> estimatedFields, List<String> warnings) {}
