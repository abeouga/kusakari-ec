package jp.kusakari.ec.catalog.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;

/** Restricted to the existing Canvas contract; enum and numeric constraints are also checked after inference. */
final class PlantSuggestionSchema {

  private PlantSuggestionSchema() {}

  static ObjectNode create(ObjectMapper mapper) {
    var props = mapper.createObjectNode();
    props.set("botanicalForm", choice(mapper, "maple|monstera|iberis|hakone|goldcrest", true));
    props.set(
      "plantType",
      choice(mapper, "tree|shrub|flower|conifer|multistem|spreading|grass|rosette|vine|palm", false)
    );
    props.set("heightCm", number(mapper, "integer", 10, 1500));
    props.set("widthCm", number(mapper, "integer", 10, 1000));
    props.set("crownShape", choice(mapper, "round|conical|spreading", false));
    props.set("branchCount", number(mapper, "integer", 3, 24));
    props.set("branchAngle", number(mapper, "integer", 15, 80));
    props.set("trunkThicknessCm", number(mapper, "number", 0.2, 100));
    props.set(
      "leafShape",
      choice(mapper, "oval|narrow|needle|scale|round|heart|palmate|split|compound|succulent|grass|frond", false)
    );
    props.set("leafSizeCm", number(mapper, "number", 2, 80));
    props.set("leafDensity", choice(mapper, "low|medium|high", false));
    props.set("leafColor", mapper.createObjectNode().put("type", "string").put("pattern", "^#[0-9a-fA-F]{6}$"));
    props.set("flowerEnabled", mapper.createObjectNode().put("type", "boolean"));
    props.set("flowerShape", choice(mapper, "four|five|eight|spike|cluster|daisy|bell|plume", false));
    props.set("flowerSizeCm", number(mapper, "number", 0.3, 60));
    props.set("flowerColor", mapper.createObjectNode().put("type", "string").put("pattern", "^#[0-9a-fA-F]{6}$"));
    props.set("seed", number(mapper, "integer", 0, Integer.MAX_VALUE));
    var profile = object(mapper, props);
    profile.putArray("type").add("object").add("null");
    var result = mapper.createObjectNode();
    result.set("profile", profile);
    result.set(
      "warnings",
      mapper.createObjectNode().put("type", "array").set("items", mapper.createObjectNode().put("type", "string"))
    );
    return object(mapper, result);
  }

  private static ObjectNode object(ObjectMapper mapper, ObjectNode properties) {
    var result = mapper.createObjectNode().put("type", "object").put("additionalProperties", false);
    result.set("properties", properties);
    var required = result.putArray("required");
    properties.fieldNames().forEachRemaining(required::add);
    return result;
  }

  private static ObjectNode choice(ObjectMapper mapper, String values, boolean nullable) {
    var result = mapper.createObjectNode();
    if (nullable) result.putArray("type").add("string").add("null");
    else result.put("type", "string");
    var options = result.putArray("enum");
    List.of(values.split("\\|")).forEach(options::add);
    if (nullable) options.addNull();
    return result;
  }

  private static ObjectNode number(ObjectMapper mapper, String type, double min, double max) {
    return mapper.createObjectNode().put("type", type).put("minimum", min).put("maximum", max);
  }
}
