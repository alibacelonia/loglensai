import math
import re


_TOKEN_PATTERN = re.compile(r"[a-zA-Z][a-zA-Z0-9_]{1,}")


def _tokenize(text: str) -> list[str]:
    return [token.lower() for token in _TOKEN_PATTERN.findall(text or "")]


def _build_tfidf_vectors(texts: list[str]) -> list[dict[str, float]]:
    tokenized = [_tokenize(text) for text in texts]
    total_docs = len(tokenized)
    if total_docs == 0:
        return []

    doc_freq: dict[str, int] = {}
    for tokens in tokenized:
        for token in set(tokens):
            doc_freq[token] = doc_freq.get(token, 0) + 1

    vectors: list[dict[str, float]] = []
    for tokens in tokenized:
        if not tokens:
            vectors.append({})
            continue

        tf: dict[str, float] = {}
        token_count = len(tokens)
        for token in tokens:
            tf[token] = tf.get(token, 0.0) + (1.0 / token_count)

        vec: dict[str, float] = {}
        for token, tf_value in tf.items():
            idf = math.log((total_docs + 1) / (doc_freq[token] + 1)) + 1.0
            vec[token] = tf_value * idf
        vectors.append(vec)

    return vectors


def _cosine_similarity(left: dict[str, float], right: dict[str, float]) -> float:
    if not left or not right:
        return 0.0

    if len(left) > len(right):
        left, right = right, left

    dot = sum(value * right.get(key, 0.0) for key, value in left.items())
    left_norm = math.sqrt(sum(v * v for v in left.values()))
    right_norm = math.sqrt(sum(v * v for v in right.values()))
    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0
    return dot / (left_norm * right_norm)


def merge_clusters_tfidf(clusters: list[dict], similarity_threshold: float) -> list[dict]:
    if not clusters:
        return []

    vectors = _build_tfidf_vectors([cluster.get("sample_message", "") for cluster in clusters])
    parent = list(range(len(clusters)))

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(a: int, b: int) -> None:
        root_a = find(a)
        root_b = find(b)
        if root_a != root_b:
            parent[root_b] = root_a

    for i in range(len(clusters)):
        for j in range(i + 1, len(clusters)):
            similarity = _cosine_similarity(vectors[i], vectors[j])
            if similarity >= similarity_threshold:
                union(i, j)

    grouped: dict[int, list[dict]] = {}
    for idx, cluster in enumerate(clusters):
        root = find(idx)
        grouped.setdefault(root, []).append(cluster)

    merged = []
    for members in grouped.values():
        members_sorted = sorted(members, key=lambda item: (-item["count"], item["fingerprint"]))
        top = members_sorted[0]
        merged.append(
            {
                "merged_fingerprint": top["fingerprint"],
                "count": sum(member["count"] for member in members_sorted),
                "member_fingerprints": [
                    member["fingerprint"] for member in sorted(members, key=lambda item: item["fingerprint"])
                ],
                "sample_message": top.get("sample_message", ""),
                "level": top.get("level", "unknown"),
                "service": top.get("service", ""),
            }
        )

    return sorted(merged, key=lambda item: (-item["count"], item["merged_fingerprint"]))
